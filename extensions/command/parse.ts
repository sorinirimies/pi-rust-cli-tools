/** `/rust-cli-tools ...`: parsing and argument completion. Pure: the handler in rust-cli-tools.ts acts on the result. */
import { MODES, type Mode } from "../core/config.ts";
import { RULES, type Rule } from "../core/rules.ts";

export type Command =
	| { kind: "status" }
	| { kind: "mode"; mode: Mode }
	| { kind: "rule"; rule: Rule; on: boolean }
	| { kind: "invalid"; message: string };

export const USAGE = `Usage: /rust-cli-tools [status] · on · off · mode ${MODES.join("|")} · ${RULES.join("|")} <on|off>`;

export function parseCommand(args: string | undefined): Command {
	const [cmd, p1] = (args ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
	switch (cmd) {
		case undefined:
		case "status":
			return { kind: "status" };
		case "on":
			return { kind: "mode", mode: "rewrite" };
		case "off":
			return { kind: "mode", mode: "off" };
		case "mode":
			return (MODES as readonly string[]).includes(p1 ?? "") ? { kind: "mode", mode: p1 as Mode } : { kind: "invalid", message: `Usage: /rust-cli-tools mode ${MODES.join("|")}` };
		default:
			if ((RULES as readonly string[]).includes(cmd)) {
				return p1 === "on" || p1 === "off" ? { kind: "rule", rule: cmd as Rule, on: p1 === "on" } : { kind: "invalid", message: `Usage: /rust-cli-tools ${cmd} <on|off>` };
			}
			return { kind: "invalid", message: `Unknown option "${cmd}". ${USAGE}` };
	}
}

export interface CompletionItem {
	value: string;
	/** Required by pi: it calls `label.endsWith(...)` when applying a completion. */
	label: string;
	description?: string;
}

const TOP_LEVEL: CompletionItem[] = [
	{ value: "status", label: "status", description: "Show the settings and the installed tools" },
	{ value: "on", label: "on", description: "Rewrite grep -r, find -name and ls -l for you" },
	{ value: "off", label: "off", description: "Do nothing (no rewriting, no prompt text)" },
	{ value: "mode ", label: "mode", description: "rewrite, block, hint or off" },
	{ value: "grep ", label: "grep", description: "grep -r to rg (on or off)" },
	{ value: "find ", label: "find", description: "find -name to fd (on or off)" },
	{ value: "ls ", label: "ls", description: "ls -l to lsd (on or off)" },
];

const MODE_ITEMS: CompletionItem[] = MODES.map((m) => ({ value: `mode ${m}`, label: m }));
const ON_OFF = [{ value: "on", label: "on" }, { value: "off", label: "off" }];

/** Argument completions for the text typed after `/rust-cli-tools `. */
export function completions(prefix: string): CompletionItem[] | null {
	const text = (prefix ?? "").trimStart().toLowerCase();
	const [head, rest] = [text.split(/\s+/)[0]!, text.split(/\s+(.*)/)[1]];
	let items: CompletionItem[];
	if (rest !== undefined && head === "mode") items = MODE_ITEMS.filter((i) => i.value.startsWith(text));
	else if (rest !== undefined && (RULES as readonly string[]).includes(head)) items = ON_OFF.map((i) => ({ ...i, value: `${head} ${i.value}` })).filter((i) => i.value.startsWith(text));
	else items = TOP_LEVEL.filter((i) => i.value.startsWith(text));
	return items.length ? items : null;
}
