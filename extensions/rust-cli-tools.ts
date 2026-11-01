/**
 * pi-rust-cli-tools: steers the agent to fast modern CLI tools (rg, fd, lsd) when they are
 * installed. A `grep -r`, `find -name` or `ls -l` is rewritten to the modern tool before it
 * runs (or, in block mode, refused with a hint); the system prompt names what is installed.
 *
 * Pure logic lives in core/ and command/ (tested directly); this file only wires it to pi.
 * Settings persist in <agent dir>/rust-cli-tools.json.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { completions, parseCommand } from "./command/parse.ts";
import { type Config, DEFAULT_CONFIG, readConfig, saveConfig } from "./core/config.ts";
import { promptSection } from "./core/prompt.ts";
import { applyEdits, findings, RULES } from "./core/rules.ts";
import { detect } from "./core/tools.ts";

type StatusUi = { ui: { setStatus(key: string, text: string): void } };

/** Test hook: which tools count as installed. Without it the real PATH is asked. */
let detector: (() => Set<string>) | undefined;
export const useDetector = (fn: (() => Set<string>) | undefined): void => {
	detector = fn;
};
const installed = (): Set<string> => (detector ? detector() : detect());

export const settingsText = (c: Config): string => [`mode ${c.mode}`, ...RULES.map((r) => `${r} ${c.rules[r] ? "on" : "off"}`)].join(" · ");

export default function (pi: ExtensionAPI) {
	let config: Config = { ...DEFAULT_CONFIG, rules: { ...DEFAULT_CONFIG.rules } };
	let have = new Set<string>();
	let detected = false;
	let rewritten = 0;
	const ensure = () => {
		if (!detected) {
			have = installed();
			detected = true;
		}
	};
	const showStatus = (ctx: StatusUi) => ctx.ui.setStatus("rust-cli-tools", config.mode !== "off" && config.showStatus && rewritten > 0 ? `cli: ${rewritten} rewritten` : "");

	pi.on("session_start", async (_event, ctx) => {
		const { config: loaded, problem } = await readConfig();
		config = loaded;
		have = installed();
		detected = true;
		if (problem) ctx.ui.notify(`rust-cli-tools: ${problem}; using the defaults`, "warning");
		showStatus(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		if (config.mode === "off") return undefined;
		ensure();
		return { systemPrompt: event.systemPrompt + promptSection(have, config.mode) };
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash" || config.mode === "off" || config.mode === "hint") return undefined;
		const input = event.input as { command?: unknown };
		if (typeof input.command !== "string") return undefined;
		ensure();
		const found = findings(input.command, have, config.rules);
		if (!found.length) return undefined;
		// Rewrite mode needs every finding to have a safe rewrite; otherwise the agent is asked to retry by hand.
		const stuck = config.mode === "block" ? found[0] : found.find((f) => !f.edits);
		if (stuck) return { block: true, reason: `${stuck.hint} Re-run the command with the modern tool.` };
		input.command = applyEdits(input.command, found.flatMap((f) => f.edits!));
		rewritten++;
		showStatus(ctx);
		return undefined;
	});

	pi.registerCommand("rust-cli-tools", {
		description: "pi-rust-cli-tools: status, on, off, mode rewrite|block|hint|off, grep|find|ls on|off",
		getArgumentCompletions: (prefix: string) => completions(prefix),
		handler: async (args, ctx) => {
			const cmd = parseCommand(args);
			// The setting applies to this session either way; a failed save only means it is not remembered.
			const persist = async () => {
				try {
					await saveConfig(config);
				} catch (error) {
					ctx.ui.notify(`rust-cli-tools: could not save the setting (${(error as Error)?.message ?? String(error)}); it applies to this session only`, "warning");
				}
				showStatus(ctx);
			};
			switch (cmd.kind) {
				case "status":
					ensure();
					ctx.ui.notify(`rust-cli-tools ${settingsText(config)}\ninstalled: ${[...have].join(", ") || "none"} · ${rewritten} command${rewritten === 1 ? "" : "s"} rewritten this session`, "info");
					return;
				case "mode":
					config.mode = cmd.mode;
					await persist();
					ctx.ui.notify(`rust-cli-tools: mode ${cmd.mode}`, "info");
					return;
				case "rule":
					config.rules[cmd.rule] = cmd.on;
					await persist();
					ctx.ui.notify(`rust-cli-tools: ${cmd.rule} ${cmd.on ? "on" : "off"}`, "info");
					return;
				case "invalid":
					ctx.ui.notify(cmd.message, "warning");
					return;
			}
		},
	});
}
