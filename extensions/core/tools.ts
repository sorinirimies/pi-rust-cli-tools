/** Which modern CLI tools are installed. */
import { spawnSync } from "node:child_process";

export const TOOLS = ["rg", "fd", "bat", "lsd", "eza", "sd", "dust", "procs", "hyperfine", "tokei", "delta", "difft", "jq", "just", "rtk"] as const;

type Spawn = (cmd: string, args: string[], opts: { encoding: "utf8" }) => { status: number | null; stdout: string };

/**
 * Whether `name` resolves on PATH. Windows has no /bin/sh, so it asks `where`; everywhere
 * else `command -v` in /bin/sh. Only plain tool names are looked up (nothing reaches a shell
 * unquoted). `platform` and `spawn` are injectable for tests.
 */
export function onPath(name: string, platform: string = process.platform, spawn: Spawn = spawnSync): boolean {
	if (!/^[\w.+-]+$/.test(name)) return false;
	const r = platform === "win32" ? spawn("where", [name], { encoding: "utf8" }) : spawn("/bin/sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
	return r.status === 0 && (r.stdout ?? "").trim().length > 0;
}

/** Names from `names` that resolve on PATH. `which` is injectable for tests. */
export function detect(names: readonly string[] = TOOLS, which: (name: string) => boolean = (n) => onPath(n)): Set<string> {
	return new Set(names.filter(which));
}
