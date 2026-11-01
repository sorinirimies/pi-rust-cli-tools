import { describe, expect, test } from "bun:test";
import { detect, onPath, TOOLS } from "../extensions/core/tools.ts";

describe("detect", () => {
	test("keeps only names `which` accepts", () => {
		expect([...detect(["rg", "nope", "fd"], (n) => n !== "nope")]).toEqual(["rg", "fd"]);
	});
	test("finds git on the real PATH (every CI runner, Windows included)", () => {
		expect(detect(["git", "definitely-not-a-tool-xyz"]).has("git")).toBe(true);
		expect(detect(["definitely-not-a-tool-xyz"]).size).toBe(0);
	});
	test("the default list covers the tools the plugin knows about", () => {
		expect(TOOLS).toContain("rg");
		expect(TOOLS).toContain("rtk");
		expect(detect().size).toBeLessThanOrEqual(TOOLS.length);
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

	test("the real lookup works with the default arguments", () => {
		expect(onPath("git")).toBe(true);
		expect(onPath("definitely-not-a-tool-xyz")).toBe(false);
	});
});
