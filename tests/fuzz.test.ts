// Randomised robustness tests ("fuzzing" without extra dependencies).
//
// Every bash command the agent runs goes through `findings`, so it must survive any text, never
// touch a command inside quotes, and never rewrite for a tool that is not installed. The
// generator is seeded, so a failure prints a seed that reproduces it exactly:
//
//   FUZZ_SEED=12345 bun test tests/fuzz.test.ts --config=bunfig.fuzz.toml
//   FUZZ_ITERS=200000 bun test tests/fuzz.test.ts --config=bunfig.fuzz.toml   (the nightly workflow)
import { describe, expect, it } from "bun:test";
import { completions, parseCommand } from "../extensions/command/parse.ts";
import { sanitizeConfig } from "../extensions/core/config.ts";
import { applyEdits, findings, type Rule } from "../extensions/core/rules.ts";
import { statements } from "../extensions/core/shell.ts";
import { onPath, TOOLS } from "../extensions/core/tools.ts";

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
	const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]!;
	/** Printable ASCII, mostly; sometimes control characters and lone surrogates. */
	const string = (max = 24) => {
		const len = int(max);
		let s = "";
		for (let i = 0; i < len; i++) s += String.fromCharCode(r() < 0.8 ? 32 + int(95) : int(0xd800));
		return s;
	};
	return { r, int, pick, string };
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

const WORDS = [
	"grep", "egrep", "fgrep", "find", "ls", "du", "ps", "rg", "fd", "lsd", "cat", "echo", "-r", "-R", "-rn", "-rniw", "--recursive", "-A", "3", "-e", "-name", "-iname", "-type", "f", "d", "-exec", "-delete", "{}", "\\;",
	"-la", "-l", "-d1", "aux", ".", "src", "'*.ts'", '"a b"', "|", "||", "&&", ";", "&", "\n", "$(ls)", "`ls`", "sudo", "cd", ">", "2>&1", "<<EOF", "EOF", "#", "--include=*.ts", "-maxdepth", "2", "FOO=1", "\\", "'", '"', "(", ")",
];
const command = (g: Gen): string => Array.from({ length: 1 + g.int(12) }, () => (g.r() < 0.85 ? g.pick(WORDS) : g.string(10))).join(g.pick([" ", " ", "  ", "\t"]));

const ALL = new Set(["rg", "fd", "lsd", "eza"]);
const ON: Record<Rule, boolean> = { grep: true, find: true, ls: true };

describe("fuzz: shell and rules", () => {
	fuzz("statements never throw and every word is a slice of the original", (g) => {
		const c = command(g);
		for (const st of statements(c)) for (const w of [...st.words, ...st.redirects]) expect(c.slice(w.start, w.end)).toBe(w.raw);
		statements(g.string(60));
	});

	fuzz("findings never throw; edits stay inside the command and never overlap", (g) => {
		const c = command(g);
		const edits = findings(c, ALL, ON).flatMap((f) => f.edits ?? []);
		const sorted = [...edits].sort((a, b) => a.start - b.start);
		for (const [i, e] of sorted.entries()) {
			expect(e.start).toBeGreaterThanOrEqual(0);
			expect(e.end).toBeLessThanOrEqual(c.length);
			if (i) expect(e.start).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
		}
		applyEdits(c, edits);
	});

	fuzz("a rewritten command asks for nothing more", (g) => {
		const c = command(g);
		const found = findings(c, ALL, ON);
		if (found.some((f) => !f.edits)) return;
		const again = findings(applyEdits(c, found.flatMap((f) => f.edits!)), ALL, ON);
		expect(again).toEqual([]);
	});

	fuzz("a command inside quotes is never touched", (g) => {
		const inner = command(g).replace(/['\\\n]/g, " ");
		expect(findings(`echo '${inner}'`, ALL, ON)).toEqual([]);
		expect(findings(`git commit -m '${inner}'`, ALL, ON)).toEqual([]);
		expect(findings(`cat <<EOF\n${inner.replace(/EOF/g, "")}\nEOF`, ALL, ON)).toEqual([]);
	});

	fuzz("nothing is found for a tool that is not installed, or a rule that is off", (g) => {
		const c = command(g);
		expect(findings(c, new Set(), ON)).toEqual([]);
		expect(findings(c, ALL, { grep: false, find: false, ls: false })).toEqual([]);
		const partial = new Set(g.pick([["rg"], ["fd"], ["lsd"]]));
		for (const f of findings(c, partial, ON)) expect({ rg: "grep", fd: "find", lsd: "ls" }[[...partial][0]!]).toBe(f.rule);
	});
});

describe("fuzz: command, config, onPath", () => {
	fuzz("parseCommand and completions never throw", (g) => {
		const s = g.string(30);
		parseCommand(s);
		completions(s);
		completions(g.pick(["", "mo", "mode ", "grep ", "x"]) + s);
	});

	fuzz("sanitizeConfig always gives a valid config, whatever the input", (g) => {
		const raw = g.pick([undefined, null, 5, "x", [], { mode: g.string(6), rules: g.pick([null, "x", { grep: g.string(3), find: 1 }]), showStatus: g.string(2) }]);
		const c = sanitizeConfig(raw);
		expect(["rewrite", "block", "hint", "off"]).toContain(c.mode);
		expect(Object.keys(c.rules).sort()).toEqual(["find", "grep", "ls"]);
		expect(typeof c.showStatus).toBe("boolean");
	});

	fuzz("onPath refuses anything but a plain name without running anything", (g) => {
		let ran = 0;
		const name = g.string(12);
		const ok = onPath(name, "linux", () => (ran++, { status: 0, stdout: "x" }));
		if (!/^[\w.+-]+$/.test(name)) expect(ran).toBe(0);
		expect(ok).toBe(ran > 0);
		expect(TOOLS.length).toBeGreaterThan(0);
	});
});
