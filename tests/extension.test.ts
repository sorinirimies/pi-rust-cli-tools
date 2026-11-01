import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configPath } from "../extensions/core/config.ts";
import { promptSection } from "../extensions/core/prompt.ts";
import { settingsText, useDetector } from "../extensions/rust-cli-tools.ts";
import { fakeCtx, load } from "./helpers.ts";

const withTools = (...names: string[]) => useDetector(() => new Set(names));
const bash = (command: string) => ({ toolName: "bash", input: { command } });

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pi-rct-"));
	process.env.PI_CODING_AGENT_DIR = dir;
	withTools("rg", "fd", "lsd");
});
afterEach(() => useDetector(undefined));

describe("prompt", () => {
	test("names what is installed and what happens, per mode", () => {
		const have = new Set(["rg", "fd", "lsd"]);
		expect(promptSection(have, "rewrite")).toContain("rewritten to their modern tool for you: rg for grep -r, fd for find -name, lsd for ls -l.");
		expect(promptSection(have, "block")).toContain("blocked with a hint: use rg for grep -r");
		expect(promptSection(have, "hint")).toContain("Prefer rg for grep -r, fd for find -name, lsd for ls -l.");
		expect(promptSection(new Set(["eza"]), "hint")).toContain("Prefer eza for ls -l.");
	});

	test("with nothing to swap it only lists the tools", () => {
		const t = promptSection(new Set(["jq"]), "rewrite");
		expect(t).toContain("Installed: jq.");
		expect(t).not.toContain("rewritten");
		expect(promptSection(new Set(), "rewrite")).toContain("Installed: none.");
	});

	test("short: no list of what is missing", () => {
		expect(promptSection(new Set(["rg"]), "rewrite")).not.toMatch(/not installed/i);
	});
});

describe("extension", () => {
	test("registers the hooks and the command", () => {
		const { hooks, commands } = load();
		expect(Object.keys(hooks).sort()).toEqual(["before_agent_start", "session_start", "tool_call"]);
		expect(Object.keys(commands)).toEqual(["rust-cli-tools"]);
		expect(commands["rust-cli-tools"]!.getArgumentCompletions("g")!.map((i) => i.label)).toEqual(["grep"]);
	});

	test("appends the tool list to the system prompt, detecting lazily when session_start never ran", async () => {
		const { hooks } = load();
		const r = await hooks.before_agent_start!({ systemPrompt: "BASE" }, fakeCtx());
		expect(r.systemPrompt.startsWith("BASE")).toBe(true);
		expect(r.systemPrompt).toContain("Installed: rg, fd, lsd.");
		await hooks.session_start!({}, fakeCtx());
		expect((await hooks.before_agent_start!({ systemPrompt: "" }, fakeCtx())).systemPrompt).toContain("Modern CLI tools");
	});

	test("rewrite mode runs the modern tool instead and counts it in the status line", async () => {
		const { hooks } = load();
		const ctx = fakeCtx();
		await hooks.session_start!({}, ctx);
		const ev = bash("cd src && grep -rn foo . | head");
		expect(await hooks.tool_call!(ev, ctx)).toBeUndefined();
		expect(ev.input.command).toBe("cd src && rg -n foo . | head");
		expect(ctx.status["rust-cli-tools"]).toBe("cli: 1 rewritten");
		const ls = bash("ls -la");
		await hooks.tool_call!(ls, ctx);
		expect(ls.input.command).toBe("lsd -la");
		expect(ctx.status["rust-cli-tools"]).toBe("cli: 2 rewritten");
	});

	test("what it cannot rewrite is refused with a hint; what it has no business with passes", async () => {
		const { hooks } = load();
		const blocked = await hooks.tool_call!(bash("grep -rn 'a\\|b' ."), fakeCtx());
		expect(blocked.block).toBe(true);
		expect(blocked.reason).toContain("rg");
		expect(blocked.reason).toContain("Re-run the command with the modern tool.");
		for (const c of ["cargo build", "ls", "ls | wc -l", 'git commit -m "fix; ls -l; grep -r x ."', "cat <<EOF\nls -l\nEOF", "du -sh .", "ps aux", "grep foo file"]) {
			const ev = bash(c);
			expect(await hooks.tool_call!(ev, fakeCtx())).toBeUndefined();
			expect(ev.input.command).toBe(c);
		}
	});

	test("other tools, a missing command and a non-string command are left alone", async () => {
		const { hooks } = load();
		expect(await hooks.tool_call!({ toolName: "read", input: { command: "grep -r x ." } }, fakeCtx())).toBeUndefined();
		expect(await hooks.tool_call!({ toolName: "bash", input: {} }, fakeCtx())).toBeUndefined();
		expect(await hooks.tool_call!({ toolName: "bash", input: { command: 5 } }, fakeCtx())).toBeUndefined();
	});

	test("block mode refuses instead of rewriting; hint and off leave the command alone", async () => {
		const { hooks, commands } = load();
		const ctx = fakeCtx();
		await commands["rust-cli-tools"]!.handler("mode block", ctx);
		const b = await hooks.tool_call!(bash("grep -rn foo ."), ctx);
		expect(b.block).toBe(true);
		expect((await hooks.before_agent_start!({ systemPrompt: "" }, ctx)).systemPrompt).toContain("blocked with a hint");
		for (const mode of ["hint", "off"]) {
			await commands["rust-cli-tools"]!.handler(`mode ${mode}`, ctx);
			const ev = bash("grep -rn foo .");
			expect(await hooks.tool_call!(ev, ctx)).toBeUndefined();
			expect(ev.input.command).toBe("grep -rn foo .");
		}
		expect(await hooks.before_agent_start!({ systemPrompt: "" }, ctx)).toBeUndefined();
	});

	test("a rule can be switched off", async () => {
		const { hooks, commands } = load();
		const ctx = fakeCtx();
		await commands["rust-cli-tools"]!.handler("find off", ctx);
		const ev = bash("find . -name x");
		expect(await hooks.tool_call!(ev, ctx)).toBeUndefined();
		expect(ev.input.command).toBe("find . -name x");
		await commands["rust-cli-tools"]!.handler("find on", ctx);
		await hooks.tool_call!(ev, ctx);
		expect(ev.input.command).toBe("fd -g x .");
	});

	test("nothing installed: nothing to do", async () => {
		withTools();
		const { hooks } = load();
		const ev = bash("grep -rn foo .");
		expect(await hooks.tool_call!(ev, fakeCtx())).toBeUndefined();
		expect(ev.input.command).toBe("grep -rn foo .");
	});

	test("the command reports and persists the settings", async () => {
		const { hooks, commands } = load();
		const ctx = fakeCtx();
		await hooks.session_start!({}, ctx);
		const run = (a: string) => commands["rust-cli-tools"]!.handler(a, ctx);
		await run("status");
		expect(ctx.notes.at(-1)![0]).toBe("rust-cli-tools mode rewrite · grep on · find on · ls on\ninstalled: rg, fd, lsd · 0 commands rewritten this session");
		await hooks.tool_call!(bash("grep -rn x ."), ctx);
		await run("");
		expect(ctx.notes.at(-1)![0]).toContain("1 command rewritten");
		await run("mode hint");
		expect(ctx.notes.at(-1)).toEqual(["rust-cli-tools: mode hint", "info"]);
		await run("ls off");
		expect(ctx.notes.at(-1)![0]).toBe("rust-cli-tools: ls off");
		await run("bogus");
		expect(ctx.notes.at(-1)![1]).toBe("warning");
		expect(JSON.parse(require("node:fs").readFileSync(configPath(), "utf8"))).toEqual({ mode: "hint", rules: { grep: true, find: true, ls: false }, showStatus: true });
		expect(settingsText({ mode: "off", rules: { grep: false, find: true, ls: true }, showStatus: true })).toBe("mode off · grep off · find on · ls on");
	});

	test("the status line clears when the mode is off", async () => {
		const { hooks, commands } = load();
		const ctx = fakeCtx();
		await hooks.tool_call!(bash("grep -rn x ."), ctx);
		expect(ctx.status["rust-cli-tools"]).toBe("cli: 1 rewritten");
		await commands["rust-cli-tools"]!.handler("off", ctx);
		expect(ctx.status["rust-cli-tools"]).toBe("");
	});

	test("saved settings come back next session; a broken file warns and uses the defaults", async () => {
		writeFileSync(join(dir, "rust-cli-tools.json"), JSON.stringify({ mode: "block", showStatus: false }));
		const a = load();
		const ctx = fakeCtx();
		await a.hooks.session_start!({}, ctx);
		expect((await a.hooks.tool_call!(bash("grep -rn x ."), ctx)).block).toBe(true);
		writeFileSync(join(dir, "rust-cli-tools.json"), "{ nope");
		const b = load();
		const ctx2 = fakeCtx();
		await b.hooks.session_start!({}, ctx2);
		expect(ctx2.notes[0]![1]).toBe("warning");
		expect(ctx2.notes[0]![0]).toContain("using the defaults");
	});

	test("a save that fails is reported and the setting still applies", async () => {
		const { hooks, commands } = load();
		const ctx = fakeCtx();
		process.env.PI_CODING_AGENT_DIR = join(dir, "rust-cli-tools.json"); // a file where the directory should be
		writeFileSync(join(dir, "rust-cli-tools.json"), "x");
		await commands["rust-cli-tools"]!.handler("mode block", ctx);
		expect(ctx.notes[0]![1]).toBe("warning");
		expect(ctx.notes[0]![0]).toContain("applies to this session only");
		expect((await hooks.tool_call!(bash("grep -rn x ."), ctx)).block).toBe(true);
	});

	test("the real PATH is used when no detector is injected", async () => {
		useDetector(undefined);
		const { hooks } = load();
		const r = await hooks.before_agent_start!({ systemPrompt: "" }, fakeCtx());
		expect(r.systemPrompt).toContain("Installed:");
	});
});
