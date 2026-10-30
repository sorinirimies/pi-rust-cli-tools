import { describe, expect, test } from "bun:test";
import { check, detect, onPath, promptSection, TOOLS } from "../extensions/rust-cli-tools.ts";

const all = new Set<string>(TOOLS);
const none = new Set<string>();

describe("detect", () => {
	test("keeps only names `which` accepts", () => {
		expect([...detect(["rg", "nope", "fd"], (n) => n !== "nope")]).toEqual(["rg", "fd"]);
	});
	test("finds git on the real PATH (every CI runner, Windows included)", () => {
		expect(detect(["git", "definitely-not-a-tool-xyz"]).has("git")).toBe(true);
		expect(detect(["definitely-not-a-tool-xyz"]).size).toBe(0);
	});
});

describe("onPath", () => {
	const calls: [string, string[]][] = [];
	const spawn = (status: number | null, stdout: string) => (cmd: string, args: string[]) => {
		calls.push([cmd, args]);
		return { status, stdout };
	};

	test("asks `where` on Windows, `command -v` elsewhere", () => {
		calls.length = 0;
		expect(onPath("rg", "win32", spawn(0, "C:\\bin\\rg.exe\r\n"))).toBe(true);
		expect(onPath("rg", "linux", spawn(0, "/usr/bin/rg\n"))).toBe(true);
		expect(calls).toEqual([["where", ["rg"]], ["/bin/sh", ["-c", "command -v rg"]]]);
	});

	test("a failed lookup or empty output is not found", () => {
		expect(onPath("rg", "win32", spawn(1, ""))).toBe(false);
		expect(onPath("rg", "darwin", spawn(0, "  \n"))).toBe(false);
		expect(onPath("rg", "linux", spawn(null, null as unknown as string))).toBe(false);
	});

	test("never passes anything but a plain name to a shell", () => {
		calls.length = 0;
		for (const bad of ["rg; rm -rf /", "$(id)", "a b", "", "`x`"]) expect(onPath(bad, "linux", spawn(0, "x"))).toBe(false);
		expect(calls).toEqual([]);
	});
});

describe("check", () => {
	test.each([
		["grep -rn foo src", "rg"],
		["grep -R foo .", "rg"],
		["grep --recursive foo .", "rg"],
		["egrep -ri foo .", "rg"],
		["find . -name '*.rs'", "fd"],
		["find src -type f", "fd"],
		["ls", "lsd"],
		["ls -la src", "lsd"],
		["du -sh *", "dust"],
		["ps aux", "procs"],
		["cd x && grep -R a .", "rg"],
		["echo hi; find . -iname x", "fd"],
		["grep -rn x . | head", "rg"],
	])("blocks %s", (cmd, tool) => {
		expect(check(cmd, all)).toContain(tool);
	});

	test.each([
		"git log | grep fix",
		"cat f | grep -r x",
		"grep foo file.txt",
		"find . -name x -exec rm {} \\;",
		"find . -type f -delete",
		"ls | wc -l",
		"rg foo",
		"fd foo",
		"echo ls",
		"cargo build",
		"",
	])("allows %s", (cmd) => {
		expect(check(cmd, all)).toBeUndefined();
	});

	test("never blocks when the replacement is missing", () => {
		for (const c of ["grep -rn x .", "find . -name x", "ls", "du -sh .", "ps aux"]) expect(check(c, none)).toBeUndefined();
	});

	test("falls back to eza when lsd is missing", () => {
		expect(check("ls", new Set(["eza"]))).toContain("eza");
	});
});

describe("promptSection", () => {
	test("lists installed and missing tools", () => {
		const s = promptSection(new Set(["rg", "fd"]));
		expect(s).toContain("Installed: rg, fd.");
		expect(s).toContain("Not installed");
		expect(s).toContain("lsd");
	});
	test("omits the missing line when everything is installed", () => {
		expect(promptSection(all)).not.toContain("Not installed");
	});
	test("handles none installed", () => {
		expect(promptSection(none)).toContain("Installed: none.");
	});
});
