// Randomised robustness tests ("fuzzing" without extra dependencies).
//
// Every bash command the agent runs goes through `check`, so it must survive any text and
// never block a command for a tool that is not installed. The generator is seeded, so a
// failure prints a seed that reproduces it exactly:
//
//   FUZZ_SEED=12345 bun test tests/fuzz.test.ts --config=bunfig.fuzz.toml
//   FUZZ_ITERS=200000 bun test tests/fuzz.test.ts --config=bunfig.fuzz.toml   (the nightly workflow)
import { describe, expect, it } from "bun:test";
import { check, onPath, promptSection, TOOLS } from "../extensions/rust-cli-tools.ts";

const KEYS: string[] = [];
const ITERS = Number(process.env.FUZZ_ITERS ?? 400);
const SEED = Number(process.env.FUZZ_SEED ?? Math.floor(Math.random() * 2 ** 31));

/** mulberry32: small, fast, seedable. */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function gen(seed: number) {
	const r = rng(seed);
	const int = (n: number) => Math.floor(r() * n);
	const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)];
	const NASTY = [0, -0, 1, -1, 0.5, NaN, Infinity, -Infinity, 1e308, -1e308, 2 ** 53, 2 ** 31, 1e-300, Number.MAX_SAFE_INTEGER];
	const number = () => (r() < 0.5 ? pick(NASTY) : (r() - 0.5) * 10 ** int(16));
	/** Printable ASCII, mostly; sometimes control characters and lone surrogates. */
	const string = (max = 24) => {
		const len = int(max);
		let s = "";
		for (let i = 0; i < len; i++) s += String.fromCharCode(r() < 0.8 ? 32 + int(95) : int(0xd800));
		return s;
	};
	const value = (depth = 0): unknown => {
		const k = int(depth > 2 ? 6 : 9);
		if (k === 0) return number();
		if (k === 1) return string();
		if (k === 2) return null;
		if (k === 3) return undefined;
		if (k === 4) return r() < 0.5;
		if (k === 5) return pick(["", "NaN", "0", "-5", "1e999", "true"]);
		if (k === 6) return Array.from({ length: int(4) }, () => value(depth + 1));
		const o: Record<string, unknown> = {};
		for (let i = 0; i < int(5); i++) o[KEYS.length && r() < 0.6 ? pick(KEYS) : string()] = value(depth + 1);
		return o;
	};
	return { r, int, pick, number, string, value };
}
type Gen = ReturnType<typeof gen>;

/** Run `fn` ITERS times; on failure say which iteration and how to reproduce it. */
function fuzz(name: string, fn: (g: Gen) => void | Promise<void>, iters = ITERS) {
	it(`${name} (seed ${SEED}, ${iters} runs)`, async () => {
		for (let i = 0; i < iters; i++) {
			try {
				await fn(gen(SEED + i));
			} catch (e) {
				throw new Error(`${name}: failed at FUZZ_SEED=${SEED + i} FUZZ_ITERS=1: ${(e as Error).message}`);
			}
		}
	});
}

const WORDS = ["grep", "egrep", "find", "ls", "du", "ps", "rg", "fd", "cat", "echo", "-r", "-R", "-rn", "--recursive", "-name", "-iname", "-type", "f", "-exec", "-delete", "{}", "\\;", "-la", "-d1", "aux", ".", "src", "'*.ts'", "|", "||", "&&", ";", "\n", "$(ls)", "`ls`", "sudo", "cd"];
const HINTS = new Set([
	"Use `rg` instead of recursive grep (e.g. `rg -n pattern path`; add `-uu` to include ignored files).",
	"Use `fd` instead of find (e.g. `fd -e rs pattern path`; add `-HI` for hidden/ignored files).",
	"Use `lsd` instead of ls (e.g. `lsd -la`).",
	"Use `eza` instead of ls (e.g. `eza -la`).",
	"Use `dust -d1` instead of du.",
	"Use `procs <name>` instead of ps.",
]);
/** The tool a hint asks for. */
const toolOf = (hint: string) => /^Use `(\w+)/.exec(hint)?.[1] ?? "";

function command(g: Gen): string {
	const n = 1 + g.int(10);
	return Array.from({ length: n }, () => (g.r() < 0.8 ? g.pick(WORDS) : g.string(12))).join(g.pick([" ", " ", "  ", "\t"]));
}
const installed = (g: Gen): Set<string> => new Set(TOOLS.filter(() => g.r() < 0.5));

describe("fuzz: check", () => {
	fuzz("never throws; a hint is one of the known ones and names an installed tool", (g) => {
		const have = installed(g);
		const hint = check(g.r() < 0.1 ? g.string(200) : command(g), have);
		if (hint === undefined) return;
		expect(HINTS.has(hint)).toBe(true);
		expect(have.has(toolOf(hint))).toBe(true);
	});

	fuzz("nothing installed: nothing is ever blocked", (g) => {
		expect(check(command(g), new Set())).toBeUndefined();
	});

	fuzz("a filter after a pipe is never blocked (only the first stage counts)", (g) => {
		const first = g.pick(["echo hi", "cat x", "rg foo", "git log"]);
		expect(check(`${first} | ${command(g).replace(/;|&&|\|\||\n/g, " ")}`, new Set(TOOLS))).toBeUndefined();
	});

	fuzz("the hint does not depend on surrounding blanks", (g) => {
		const c = command(g);
		const have = installed(g);
		expect(check(`  ${c}\t`, have)).toBe(check(c, have));
	});
});

describe("fuzz: onPath and promptSection", () => {
	fuzz("onPath sends only plain names to a shell", (g) => {
		const name = g.r() < 0.5 ? g.string(16) : g.pick([...TOOLS]);
		let asked: string[] | undefined;
		const found = onPath(name, g.pick(["linux", "darwin", "win32"]), (_cmd, args) => {
			asked = args;
			return { status: g.pick([0, 1, null]), stdout: g.string() };
		});
		expect(typeof found).toBe("boolean");
		if (asked) expect(/^[\w.+-]+$/.test(name)).toBe(true);
	});

	fuzz("promptSection lists every tool exactly once, installed or not", (g) => {
		const have = installed(g);
		const text = promptSection(have);
		const installedLine = /Installed: (.*)\.\n/.exec(text)?.[1] ?? "";
		const missingLine = /Not installed \(use classic fallbacks\): (.*)\.\n/.exec(text)?.[1] ?? "";
		const listed = [...installedLine.split(", "), ...missingLine.split(", ")].filter((t) => t && t !== "none");
		expect(listed.sort()).toEqual([...TOOLS].sort());
		for (const t of have) expect(installedLine.split(", ")).toContain(t);
	});
});
