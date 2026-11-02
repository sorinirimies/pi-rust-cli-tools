/**
 * What to do about `grep -r`, `find -name` and `ls -l` when a modern tool is installed.
 *
 * Each statement of a command is looked at on its own (see shell.ts, so quotes and heredocs
 * are not mistaken for commands). A finding either carries `edits` (the command can be
 * rewritten for the modern tool without changing what it means) or only a `hint` (it cannot,
 * so the agent is told to retry by hand).
 */
import { program, statements, type Statement, type Word } from "./shell.ts";

export type Rule = "grep" | "find" | "ls";
export const RULES: readonly Rule[] = ["grep", "find", "ls"];

export type Edit = { start: number; end: number; text: string };
export type Finding = { rule: Rule; hint: string; edits?: Edit[] };

const HINTS: Record<Rule, string> = {
	grep: "Use `rg` instead of recursive grep (e.g. `rg -n pattern path`; add `-uu` to include ignored files).",
	find: "Use `fd` instead of find (e.g. `fd -e rs pattern path`; add `-HI` for hidden/ignored files).",
	ls: "Use `lsd` instead of ls -l (e.g. `lsd -la`).",
};

/** Quote one word for the shell unless it is plainly safe. */
export function quote(s: string): string {
	return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

// ── grep → rg ────────────────────────────────────────────────────────────────

/** Short grep flags that mean the same to rg. */
const SAME = new Set("nilwxcvFPHqoa");
/** Long grep flags that mean the same to rg: name → rg flag. */
const LONG: Record<string, string> = {
	"line-number": "-n",
	"ignore-case": "-i",
	"word-regexp": "-w",
	"line-regexp": "-x",
	"files-with-matches": "-l",
	"files-without-match": "--files-without-match",
	count: "-c",
	"invert-match": "-v",
	"fixed-strings": "-F",
	"perl-regexp": "-P",
	"with-filename": "-H",
	"no-filename": "--no-filename",
	"only-matching": "-o",
	quiet: "-q",
	silent: "-q",
	text: "-a",
	"no-messages": "--no-messages",
	"line-buffered": "--line-buffered",
	"dereference-recursive": "-L",
};
/** Long grep flags that take a value, and what rg calls them. */
const LONG_VALUE: Record<string, (v: string) => string[]> = {
	include: (v) => ["-g", quote(v)],
	exclude: (v) => ["-g", quote(`!${v}`)],
	"exclude-dir": (v) => ["-g", quote(`!${v}`)],
	"max-count": (v) => ["-m", quote(v)],
	"after-context": (v) => ["-A", quote(v)],
	"before-context": (v) => ["-B", quote(v)],
	context: (v) => ["-C", quote(v)],
};
const DROPPED_LONG = new Set(["recursive", "extended-regexp", "basic-regexp"]);
const VALUE_SHORT: Record<string, string> = { A: "-A", B: "-B", C: "-C", m: "-m" };

const isRecursive = (args: Word[]): boolean => {
	for (const a of args) {
		if (a.text === "--") return false;
		if (a.text === "--recursive" || a.text === "--dereference-recursive") return true;
		if (/^-[A-Za-z]+$/.test(a.text) && /[rR]/.test(a.text)) return true;
	}
	return false;
};

/** Escapes a basic regex may use that mean the same to rg. */
const SAME_ESCAPE = /[.*[\]^$\\wWsSbB-]/;

/**
 * A POSIX basic regex (grep without -E/-F/-P) spelled for rg, or undefined when that cannot be
 * done exactly. In a basic regex `+ ? | { } ( )` are plain characters and the GNU escapes
 * `\( \| \{` are the operators; rg reads them the other way round.
 */
export function basicToRg(p: string): string | undefined {
	let out = "";
	for (let i = 0; i < p.length; i++) {
		const c = p[i]!;
		if (c === "\\") {
			const next = p[++i];
			if (next === undefined || !SAME_ESCAPE.test(next)) return undefined;
			out += c + next;
		} else if (c === "[") {
			const end = bracketEnd(p, i);
			if (end === undefined) return undefined;
			const body = p.slice(i + 1, end);
			// grep reads a backslash in [...] literally; rg nests on `[` and has && -- ~~ set operators.
			if (/\\|&&|--|~~|\[[.=]/.test(body)) return undefined;
			out += `[${body.replace(/\[(?!:)|(?<!:)\]/g, (b, at: number) => (at === 0 || (at === 1 && body[0] === "^") ? `\\${b}` : b === "[" ? "\\[" : b))}]`;
			i = end;
		} else if ("+?|{}()".includes(c)) out += `\\${c}`;
		else if (c === "*" && (out === "" || out === "^")) out += "\\*";
		else if (c === "*" && p[i - 1] === "*") return undefined;
		else if (c === "^" && i > 0) out += "\\^";
		else if (c === "$" && i < p.length - 1) out += "\\$";
		else out += c;
	}
	return out;
}

/** Index of the `]` closing the bracket expression opened at `start`, skipping [:class:] names. */
function bracketEnd(p: string, start: number): number | undefined {
	let i = start + 1;
	if (p[i] === "^") i++;
	if (p[i] === "]") i++; // a leading ] is a member, not the end
	for (; i < p.length; i++) {
		if (p[i] === "[" && p[i + 1] === ":") {
			const close = p.indexOf(":]", i + 2);
			if (close < 0) return undefined;
			i = close + 1;
		} else if (p[i] === "]") return i;
	}
	return undefined;
}

/** The rg arguments equivalent to these grep arguments, or undefined when some part has no safe equivalent. */
function rewriteGrep(args: Word[], kind: "grep" | "egrep" | "fgrep"): string[] | undefined {
	const flags: string[] = [];
	const seen = new Set<string>();
	/** A flag without a value is only passed once. */
	const flag = (f: string) => {
		if (!seen.has(f)) (seen.add(f), flags.push(f));
	};
	if (kind === "fgrep") flag("-F");
	const positionals: Word[] = [];
	const exprs: string[] = []; // -e / --regexp values
	let patternFile: string | undefined; // -f / --file
	let afterDashes = false;
	let regexKind = kind !== "grep"; // -E, -F or -P: the pattern is not a POSIX basic regex
	let reportsLines = false; // -n given, or an output mode where line numbers make no sense
	for (let i = 0; i < args.length; i++) {
		const w = args[i]!;
		const t = w.text;
		if (afterDashes || !t.startsWith("-") || t === "-") {
			positionals.push(w);
		} else if (t === "--") {
			afterDashes = true;
		} else if (t.startsWith("--")) {
			const eq = t.indexOf("=");
			const name = t.slice(2, eq < 0 ? undefined : eq);
			let value = eq < 0 ? undefined : t.slice(eq + 1);
			if (DROPPED_LONG.has(name)) {
				if (name === "extended-regexp") regexKind = true;
			} else if (name === "color" || name === "colour") {
				flag(`--color=${value ?? "auto"}`);
			} else if (name === "binary-files") {
				value ??= args[++i]?.text;
				if (value === "text") flag("-a");
				else if (value !== "without-match") return undefined;
			} else if (LONG[name]) {
				flag(LONG[name]!);
				if (name === "fixed-strings" || name === "perl-regexp") regexKind = true;
				if (["line-number", "count", "files-with-matches", "files-without-match", "quiet", "silent"].includes(name)) reportsLines = true;
			} else if (LONG_VALUE[name] || name === "regexp" || name === "file") {
				value ??= args[++i]?.text;
				if (value === undefined) return undefined;
				if (name === "regexp") exprs.push(value);
				else if (name === "file") patternFile = value;
				else flags.push(...LONG_VALUE[name]!(value));
			} else return undefined;
		} else {
			for (let j = 1; j < t.length; j++) {
				const c = t[j]!;
				if (c === "r" || c === "R" || c === "I" || c === "G") continue;
				if (c === "E") regexKind = true;
				else if (SAME.has(c)) {
					flag(`-${c}`);
					if (c === "F" || c === "P") regexKind = true;
					if ("nclq".includes(c)) reportsLines = true;
				} else if (c === "L") (flag("--files-without-match"), (reportsLines = true));
				else if (c === "s") flag("--no-messages");
				else if (c === "h") flag("--no-filename");
				else if (VALUE_SHORT[c] || c === "e" || c === "f") {
					const rest = t.slice(j + 1);
					const value = rest || args[++i]?.text;
					if (value === undefined) return undefined;
					if (c === "e") exprs.push(value);
					else if (c === "f") patternFile = value;
					else flags.push(VALUE_SHORT[c]!, quote(value));
					break;
				} else return undefined;
			}
		}
	}
	const patternFlag = exprs.length > 0 || patternFile !== undefined;
	if (!patternFlag && !positionals.length) return undefined;
	const pattern = patternFlag ? undefined : positionals[0]!;
	const paths = patternFlag ? positionals : positionals.slice(1);
	// The patterns as rg must see them: a basic regex is translated, a back-reference has no rg equivalent.
	let spell = (s: string): string | undefined => s;
	if (!regexKind) {
		if (patternFile !== undefined) return undefined; // patterns in a file cannot be translated
		spell = basicToRg;
	} else if (!flags.includes("-F") && !flags.includes("-P")) spell = (s) => (/\\[1-9]/.test(s) ? undefined : s);
	const spelled = [...exprs, ...(pattern ? [pattern.text] : [])].map(spell);
	if (spelled.some((s) => s === undefined)) return undefined;
	const eArgs = exprs.flatMap((_, i) => ["-e", quote(spelled[i]!)]);
	const fArgs = patternFile === undefined ? [] : ["-f", quote(patternFile)];
	const patternArg = pattern ? [spelled.at(-1) === pattern.text ? pattern.raw : quote(spelled.at(-1)!)] : [];
	// Without a path rg could read stdin instead of the directory: always name it.
	return [...(reportsLines ? [] : ["-n"]), ...flags, ...eArgs, ...fArgs, ...(afterDashes ? ["--"] : []), ...patternArg, ...(paths.length ? paths.map((p) => p.raw) : ["."])];
}

// ── find → fd ────────────────────────────────────────────────────────────────

function rewriteFind(args: Word[]): string[] | undefined {
	const paths: Word[] = [];
	let i = 0;
	while (i < args.length && !/^(-|\(|!|\\\()/.test(args[i]!.text)) paths.push(args[i++]!);
	let name: Word | undefined;
	let ignoreCase = false;
	const flags: string[] = [];
	const value = () => args[++i];
	for (; i < args.length; i++) {
		const t = args[i]!.text;
		if (t === "-name" || t === "-iname") {
			const v = value();
			// A `/` never matches a find -name, but makes fd -g compare the whole path.
			if (name || !v || v.text.includes("/")) return undefined;
			name = v;
			ignoreCase = t === "-iname";
		} else if (t === "-type") {
			const v = value();
			if (!v || !/^[fdl]$/.test(v.text)) return undefined;
			flags.push("-t", v.text);
		} else if (t === "-maxdepth" || t === "-mindepth") {
			const v = value();
			if (!v || !/^\d+$/.test(v.text)) return undefined;
			flags.push(t === "-maxdepth" ? "-d" : "--min-depth", v.text);
		} else if (t !== "-print") return undefined;
	}
	return [...(ignoreCase ? ["-i"] : []), ...flags, ...(name ? ["-g", name.raw] : ["."]), ...paths.map((p) => p.raw)];
}

// ── ls → lsd ─────────────────────────────────────────────────────────────────

/** `ls` flags lsd takes unchanged. */
const LS_FLAGS = /^-[lahAtSr1RdF]+$/;

// ── Statements ───────────────────────────────────────────────────────────────

function edit(st: Statement, from: Word, to: Word, tokens: string[]): Edit {
	// A redirection between the first and last word belongs after the rewritten command.
	const inside = st.redirects.filter((r) => r.start > from.start && r.end < to.end).map((r) => r.raw);
	return { start: from.start, end: to.end, text: [...tokens, ...inside].join(" ") };
}

function inspect(st: Statement, have: ReadonlySet<string>, enabled: Readonly<Record<Rule, boolean>>): Finding | undefined {
	const prog = program(st.words);
	if (!prog) return undefined;
	const args = st.words.slice(prog.index + 1);
	const first = st.words[prog.index]!;
	const last = st.words.at(-1)!;
	switch (prog.name) {
		case "grep":
		case "egrep":
		case "fgrep": {
			if (!enabled.grep || !have.has("rg") || !isRecursive(args)) return undefined;
			const tokens = rewriteGrep(args, prog.name as "grep" | "egrep" | "fgrep");
			return { rule: "grep", hint: HINTS.grep, edits: tokens ? [edit(st, first, last, ["rg", ...tokens])] : undefined };
		}
		case "find": {
			const named = args.some((a) => a.text === "-name" || a.text === "-iname" || a.text === "-type");
			const risky = args.some((a) => /^-(exec|execdir|delete|mtime|size|perm)$/.test(a.text));
			if (!enabled.find || !have.has("fd") || !named || risky) return undefined;
			const tokens = rewriteFind(args);
			return { rule: "find", hint: HINTS.find, edits: tokens ? [edit(st, first, last, ["fd", ...tokens])] : undefined };
		}
		case "ls": {
			const tool = have.has("lsd") ? "lsd" : have.has("eza") ? "eza" : undefined;
			const long = args.some((a) => /^-[A-Za-z0-9]*l/.test(a.text));
			// Plain `ls` is already small; only the long format has something to gain. A pipe may count its lines.
			if (!enabled.ls || !tool || !long || st.piped) return undefined;
			const plain = tool === "lsd" && args.every((a) => LS_FLAGS.test(a.text) || !a.text.startsWith("-"));
			return { rule: "ls", hint: HINTS.ls.replaceAll("lsd", tool), edits: plain ? [{ start: first.start, end: first.end, text: "lsd" }] : undefined };
		}
		default:
			return undefined;
	}
}

/** Everything in `command` that a modern tool should handle. */
export function findings(command: string, have: ReadonlySet<string>, enabled: Readonly<Record<Rule, boolean>>): Finding[] {
	return statements(command).flatMap((st) => inspect(st, have, enabled) ?? []);
}

/** `command` with the edits applied (they never overlap: one per statement). */
export function applyEdits(command: string, edits: Edit[]): string {
	let out = command;
	for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
	return out;
}
