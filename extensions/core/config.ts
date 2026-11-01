/**
 * The persisted settings: <agent dir>/rust-cli-tools.json.
 *
 * A hand-edited file can hold anything, so `sanitizeConfig` keeps valid values and defaults the
 * rest. A missing file is not a problem (defaults); a broken one is reported, never thrown.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { RULES, type Rule } from "./rules.ts";

/** What happens to a `grep -r`, `find -name` or `ls -l` when the modern tool is installed. */
export const MODES = ["rewrite", "block", "hint", "off"] as const;
export type Mode = (typeof MODES)[number];

export interface Config {
	/** rewrite: run the modern tool instead; block: refuse with a hint; hint: only tell the model; off: do nothing. */
	mode: Mode;
	/** Which commands are looked at. */
	rules: Record<Rule, boolean>;
	/** Show how many commands were rewritten in the status line. */
	showStatus: boolean;
}

export const DEFAULT_CONFIG: Config = {
	mode: "rewrite",
	rules: Object.fromEntries(RULES.map((r) => [r, true])) as Record<Rule, boolean>,
	showStatus: true,
};

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

export function sanitizeConfig(raw: unknown): Config {
	const r = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
	const rules = (typeof r.rules === "object" && r.rules !== null ? r.rules : {}) as Record<string, unknown>;
	const d = DEFAULT_CONFIG;
	return {
		mode: (MODES as readonly unknown[]).includes(r.mode) ? (r.mode as Mode) : d.mode,
		rules: Object.fromEntries(RULES.map((rule) => [rule, bool(rules[rule], d.rules[rule])])) as Record<Rule, boolean>,
		showStatus: bool(r.showStatus, d.showStatus),
	};
}

/** Where pi keeps its config: PI_CODING_AGENT_DIR, then $XDG_CONFIG_HOME/pi/agent, then ~/.pi/agent. */
export function resolveAgentDir(env: Record<string, string | undefined>, home: string): string {
	if (env.PI_CODING_AGENT_DIR) return env.PI_CODING_AGENT_DIR;
	if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "pi", "agent");
	return join(home, ".pi", "agent");
}

export const configPath = (env: Record<string, string | undefined> = process.env, home = homedir()): string =>
	join(resolveAgentDir(env, home), "rust-cli-tools.json");

/** The config, plus a `problem` when the file exists but cannot be used. */
export async function readConfig(path = configPath()): Promise<{ config: Config; problem?: string }> {
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (e) {
		const code = (e as { code?: string } | null)?.code;
		return code === "ENOENT" ? { config: sanitizeConfig({}) } : { config: sanitizeConfig({}), problem: `cannot read ${path} (${code ?? "error"})` };
	}
	try {
		return { config: sanitizeConfig(JSON.parse(raw)) };
	} catch {
		return { config: sanitizeConfig({}), problem: `${path} is not valid JSON` };
	}
}

export async function loadConfig(path = configPath()): Promise<Config> {
	return (await readConfig(path)).config;
}

/** Atomic: written to a temp file and renamed, so a crash or a second pi session never leaves half a file. */
export async function saveConfig(config: Config, path = configPath()): Promise<void> {
	await mkdir(join(path, ".."), { recursive: true });
	const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
	try {
		await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
		await rename(tmp, path);
	} catch (e) {
		await Promise.allSettled([rm(tmp, { force: true })]); // the original error matters more
		throw e;
	}
}
