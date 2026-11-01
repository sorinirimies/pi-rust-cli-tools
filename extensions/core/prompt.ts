/** The paragraph appended to the system prompt: short, and only about what is installed. */
import type { Mode } from "./config.ts";

export function promptSection(have: ReadonlySet<string>, mode: Mode): string {
	const swaps = [have.has("rg") && "rg for grep -r", have.has("fd") && "fd for find -name", (have.has("lsd") || have.has("eza")) && `${have.has("lsd") ? "lsd" : "eza"} for ls -l`].filter(Boolean);
	const line =
		mode === "rewrite"
			? `grep -r, find -name and ls -l are rewritten to their modern tool for you: ${swaps.join(", ")}.`
			: mode === "block"
				? `Direct grep -r, find -name and ls -l calls are blocked with a hint: use ${swaps.join(", ")}.`
				: `Prefer ${swaps.join(", ")}.`;
	return `\n\n## Modern CLI tools\nInstalled: ${[...have].join(", ") || "none"}.\n${swaps.length ? `${line}\n` : ""}Prefer pi read/edit/write over cat/sed.`;
}
