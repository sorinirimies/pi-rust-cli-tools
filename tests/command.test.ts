import { describe, expect, test } from "bun:test";
import { completions, parseCommand } from "../extensions/command/parse.ts";

describe("parseCommand", () => {
	test("no argument and status show the status", () => {
		expect(parseCommand(undefined)).toEqual({ kind: "status" });
		expect(parseCommand("  ")).toEqual({ kind: "status" });
		expect(parseCommand("STATUS")).toEqual({ kind: "status" });
	});

	test("on means rewrite, off means off", () => {
		expect(parseCommand("on")).toEqual({ kind: "mode", mode: "rewrite" });
		expect(parseCommand("off")).toEqual({ kind: "mode", mode: "off" });
	});

	test("mode takes one of the four modes", () => {
		for (const mode of ["rewrite", "block", "hint", "off"]) expect(parseCommand(`mode ${mode}`)).toEqual({ kind: "mode", mode } as never);
		for (const bad of ["mode", "mode maybe"]) expect(parseCommand(bad).kind).toBe("invalid");
	});

	test("each rule switches on and off", () => {
		expect(parseCommand("grep off")).toEqual({ kind: "rule", rule: "grep", on: false });
		expect(parseCommand("find on")).toEqual({ kind: "rule", rule: "find", on: true });
		expect(parseCommand("ls off")).toEqual({ kind: "rule", rule: "ls", on: false });
		for (const bad of ["grep", "grep maybe"]) expect(parseCommand(bad).kind).toBe("invalid");
	});

	test("anything else is invalid and prints the usage", () => {
		const c = parseCommand("bogus");
		expect(c.kind === "invalid" && c.message).toContain("Usage: /rust-cli-tools");
	});
});

describe("completions", () => {
	test("completes the top level by prefix, every item has a label", () => {
		expect(completions("")!.map((i) => i.label)).toEqual(["status", "on", "off", "mode", "grep", "find", "ls"]);
		expect(completions("o")!.map((i) => i.label)).toEqual(["on", "off"]);
		expect(completions("  GR")!.map((i) => i.label)).toEqual(["grep"]);
		for (const i of completions("")!) expect(typeof i.label).toBe("string");
	});

	test("after a rule name it offers on and off; after mode it offers the modes", () => {
		expect(completions("grep ")!.map((i) => i.value)).toEqual(["grep on", "grep off"]);
		expect(completions("grep of")!.map((i) => i.value)).toEqual(["grep off"]);
		expect(completions("mode ")!.map((i) => i.value)).toEqual(["mode rewrite", "mode block", "mode hint", "mode off"]);
		expect(completions("mode b")!.map((i) => i.label)).toEqual(["block"]);
	});

	test("nothing matches, nothing is offered", () => {
		expect(completions("zzz")).toBeNull();
		expect(completions(undefined as unknown as string)).not.toBeNull();
	});
});
