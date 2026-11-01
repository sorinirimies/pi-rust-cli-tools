/**
 * A bash command line cut into statements and words, just far enough to find the commands it
 * runs: quotes, `$(...)`, backticks and heredoc bodies are understood, so `git commit -m "fix;
 * ls"` and `cat <<EOF\nls\nEOF` are not mistaken for an `ls`.
 *
 * Only the first stage of a pipeline is kept (`a | b` gives `a`, flagged `piped`). Redirections
 * are kept apart from the words. Every word knows its place in the original string, so a caller
 * can replace a word (or a run of words) and leave everything else byte for byte as it was.
 */

export type Word = { text: string; raw: string; start: number; end: number };
export type Statement = { words: Word[]; redirects: Word[]; piped: boolean };

const SPACE = /[ \t\r]/;
const REDIRECT = /^(\d*>>?|\d*<|&>|>&|\d*>&\d*-?)/;

/** Index just past the construct that opens at `i` (`$(…)`, `${…}`, a backtick pair), or `i` when none. */
function skipExpansion(s: string, i: number): number {
	if (s[i] === "`") {
		const close = s.indexOf("`", i + 1);
		return close < 0 ? s.length : close + 1;
	}
	if (s[i] === "$" && (s[i + 1] === "(" || s[i + 1] === "{")) {
		const open = s[i + 1]!;
		const close = open === "(" ? ")" : "}";
		let depth = 0;
		for (let j = i + 1; j < s.length; j++) {
			if (s[j] === open) depth++;
			else if (s[j] === close && --depth === 0) return j + 1;
			else if (s[j] === "'") j = s.indexOf("'", j + 1) < 0 ? s.length : s.indexOf("'", j + 1);
		}
		return s.length;
	}
	return i;
}

/** The delimiter of a heredoc whose `<<` starts at `i`, or undefined for `<<<` and anything odd. */
function heredoc(s: string, i: number): { word: string; dash: boolean; end: number } | undefined {
	const m = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z_][\w-]*))/.exec(s.slice(i));
	if (!m || s[i + 2] === "<") return undefined;
	return { word: m[2] ?? m[3] ?? m[4]!, dash: m[1] === "-", end: i + m[0].length };
}

export function statements(command: string): Statement[] {
	const out: Statement[] = [];
	let words: Word[] = [];
	let redirects: Word[] = [];
	let piped = false;
	let skipStage = false;
	const pending: { word: string; dash: boolean }[] = [];
	// The word after a bare `>` or `<` is the redirection's target, not an argument.
	let target: boolean = false;
	const end = () => {
		if (words.length || redirects.length) out.push({ words, redirects, piped });
		words = [];
		redirects = [];
		piped = false;
		skipStage = false;
		target = false;
	};

	let i = 0;
	const n = command.length;
	while (i < n) {
		const c = command[i]!;
		if (SPACE.test(c)) {
			i++;
		} else if (c === "\n") {
			end();
			i++;
			// Heredoc bodies start on the next line and run to the delimiter line.
			for (const h of pending.splice(0)) {
				for (;;) {
					const eol = command.indexOf("\n", i);
					const line = command.slice(i, eol < 0 ? n : eol);
					i = eol < 0 ? n : eol + 1;
					if ((h.dash ? line.replace(/^\t+/, "") : line) === h.word || eol < 0) break;
				}
			}
		} else if (c === ";" || (c === "&" && command[i + 1] !== ">") || (c === "|" && command[i + 1] === "|")) {
			// `&&`, `||`, `;` and `&` end a statement (`&>` is a redirection, handled with the words).
			end();
			i += command[i + 1] === c && c !== ";" ? 2 : 1;
		} else if (c === "|") {
			piped = true;
			skipStage = true;
			i++;
			if (command[i] === "&") i++;
		} else if (c === "#") {
			while (i < n && command[i] !== "\n") i++;
		} else {
			// A word: runs to unquoted whitespace or an operator.
			const start = i;
			let text = "";
			const h = command[i] === "<" ? heredoc(command, i) : undefined;
			if (h) {
				pending.push(h);
				if (!skipStage) redirects.push({ text: command.slice(i, h.end), raw: command.slice(i, h.end), start: i, end: h.end });
				i = h.end;
				continue;
			}
			const red: boolean = !skipStage && (REDIRECT.test(command.slice(i)) || target);
			while (i < n) {
				const ch = command[i]!;
				if (SPACE.test(ch) || ch === "\n" || ch === ";" || ch === "|") break;
				if (ch === "&" && command[i - 1] !== ">" && command[i - 1] !== "<" && command[i + 1] !== ">") break;
				if (ch === "'") {
					const close = command.indexOf("'", i + 1);
					const stop = close < 0 ? n : close;
					text += command.slice(i + 1, stop);
					i = close < 0 ? n : close + 1;
				} else if (ch === '"') {
					i++;
					while (i < n && command[i] !== '"') {
						if (command[i] === "\\" && i + 1 < n) (text += command[i + 1], (i += 2));
						else {
							const skip = skipExpansion(command, i);
							if (skip > i) (text += command.slice(i, skip), (i = skip));
							else text += command[i++];
						}
					}
					i = Math.min(i + 1, n);
				} else if (ch === "\\" && i + 1 < n) {
					if (command[i + 1] !== "\n") text += command[i + 1];
					i += 2;
				} else {
					const skip = skipExpansion(command, i);
					if (skip > i) (text += command.slice(i, skip), (i = skip));
					else text += command[i++];
				}
			}
			if (skipStage) continue;
			const word = { text, raw: command.slice(start, i), start, end: i };
			target = red && /^(\d*>>?|\d*<|&>)$/.test(word.raw);
			(red ? redirects : words).push(word);
		}
	}
	end();
	return out;
}

/** Skips leading `VAR=value` assignments: the program is the first word after them. */
export function program(words: Word[]): { index: number; name: string } | undefined {
	const index = words.findIndex((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w.text));
	return index < 0 ? undefined : { index, name: words[index]!.text.split("/").pop()! };
}
