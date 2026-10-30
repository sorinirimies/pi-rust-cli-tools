/**
 * pi-rust-cli-tools: tells the agent which modern CLI tools are installed and blocks
 * direct file-search / listing calls that have an installed replacement.
 *
 * Only the first stage of a top-level command is checked: pipe filters (`cmd | grep x`),
 * `find -exec`, and anything that is not a plain command start are left alone.
 * Zero prompt tokens beyond a one-paragraph tool list appended to the system prompt.
 */
import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const TOOLS = ["rg", "fd", "bat", "lsd", "eza", "sd", "dust", "procs", "hyperfine", "tokei", "delta", "difft", "jq", "just"] as const;

/** Names from `names` that resolve on PATH. `which` is injectable for tests. */
export function detect(
	names: readonly string[] = TOOLS,
	which: (name: string) => boolean = (n) => {
		const r = spawnSync("/bin/sh", ["-c", `command -v ${n}`], { encoding: "utf8" });
		return r.status === 0 && r.stdout.trim().length > 0;
	},
): Set<string> {
	return new Set(names.filter(which));
}

/** A hint when `command` should use an installed modern tool, otherwise undefined. */
export function check(command: string, have: ReadonlySet<string>): string | undefined {
	// Split on ; && || and newlines. A single `|` is a pipeline: only its first stage is checked.
	for (const raw of command.split(/;|&&|\|\||\n/)) {
		const seg = raw.trim().split(/(?<!\|)\|(?!\|)/)[0].trim();
		if (/^(grep|egrep)\b/.test(seg) && /\s-[a-zA-Z]*[rR]|\s--recursive/.test(seg) && have.has("rg"))
			return "Use `rg` instead of recursive grep (e.g. `rg -n pattern path`; add `-uu` to include ignored files).";
		if (/^find\s/.test(seg) && /\s-(i?name|type)\b/.test(seg) && !/\s-(exec|delete|mtime|size|perm)\b/.test(seg) && have.has("fd"))
			return "Use `fd` instead of find (e.g. `fd -e rs pattern path`; add `-HI` for hidden/ignored files).";
		if (/^ls(\s|$)/.test(seg) && !/\|/.test(raw)) {
			const t = have.has("lsd") ? "lsd" : have.has("eza") ? "eza" : undefined;
			if (t) return `Use \`${t}\` instead of ls (e.g. \`${t} -la\`).`;
		}
		if (/^du\s/.test(seg) && have.has("dust")) return "Use `dust -d1` instead of du.";
		if (/^ps(\s|$)/.test(seg) && have.has("procs")) return "Use `procs <name>` instead of ps.";
	}
	return undefined;
}

/** The paragraph appended to the system prompt. */
export function promptSection(have: ReadonlySet<string>, all: readonly string[] = TOOLS): string {
	const missing = all.filter((t) => !have.has(t));
	return (
		`\n\n## Modern CLI tools (auto-detected)\nInstalled: ${[...have].join(", ") || "none"}.\n` +
		(missing.length ? `Not installed (use classic fallbacks): ${missing.join(", ")}.\n` : "") +
		"In bash, prefer rg over grep -r, fd over find, lsd/eza over ls, dust over du, procs over ps. " +
		"Direct recursive grep/find/ls calls may be blocked with a hint. Prefer pi read/edit/write over cat/sed."
	);
}

export default function (pi: ExtensionAPI) {
	let have = new Set<string>();
	let detected = false;
	const ensure = () => {
		if (!detected) {
			have = detect();
			detected = true;
		}
	};

	pi.on("session_start", async () => {
		have = detect();
		detected = true;
	});

	pi.on("before_agent_start", async (event) => {
		ensure();
		return { systemPrompt: event.systemPrompt + promptSection(have) };
	});

	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash") return undefined;
		ensure();
		const hint = check(String((event.input as { command?: string }).command ?? ""), have);
		return hint ? { block: true, reason: `${hint} Re-run the command with the modern tool.` } : undefined;
	});
}
