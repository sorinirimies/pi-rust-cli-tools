import { describe, expect, test } from "bun:test";
import ext from "../extensions/rust-cli-tools.ts";

type Handler = (event: any) => Promise<any>;

function load() {
	const handlers: Record<string, Handler> = {};
	ext({ on: (name: string, h: Handler) => (handlers[name] = h) } as any);
	return handlers;
}

describe("extension", () => {
	test("registers the three hooks", () => {
		expect(Object.keys(load()).sort()).toEqual(["before_agent_start", "session_start", "tool_call"]);
	});

	test("appends the tool list to the system prompt", async () => {
		const h = load();
		await h.session_start({});
		const r = await h.before_agent_start({ systemPrompt: "BASE" });
		expect(r.systemPrompt.startsWith("BASE")).toBe(true);
		expect(r.systemPrompt).toContain("Modern CLI tools");
	});

	test("detects lazily when session_start never ran", async () => {
		const r = await load().before_agent_start({ systemPrompt: "" });
		expect(r.systemPrompt).toContain("Installed:");
	});

	test("ignores non-bash tools", async () => {
		expect(await load().tool_call({ toolName: "read", input: { command: "grep -r x ." } })).toBeUndefined();
	});

	test("tolerates a missing command", async () => {
		expect(await load().tool_call({ toolName: "bash", input: {} })).toBeUndefined();
	});

	test("blocks recursive grep when rg is installed, allows plain commands", async () => {
		const h = load();
		await h.session_start({});
		const blocked = await h.tool_call({ toolName: "bash", input: { command: "grep -rn foo ." } });
		const hasRg = /Installed:.*\brg\b/.test((await h.before_agent_start({ systemPrompt: "" })).systemPrompt);
		if (hasRg) {
			expect(blocked.block).toBe(true);
			expect(blocked.reason).toContain("rg");
		} else expect(blocked).toBeUndefined();
		expect(await h.tool_call({ toolName: "bash", input: { command: "cargo build" } })).toBeUndefined();
	});
});
