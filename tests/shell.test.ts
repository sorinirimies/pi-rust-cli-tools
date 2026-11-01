import { describe, expect, test } from "bun:test";
import { program, statements } from "../extensions/core/shell.ts";

const words = (c: string) => statements(c).map((s) => s.words.map((w) => w.text));

describe("statements", () => {
	test("operators split statements; a quoted operator does not", () => {
		expect(words("a x; b y && c z || d w\ne v")).toEqual([["a", "x"], ["b", "y"], ["c", "z"], ["d", "w"], ["e", "v"]]);
		expect(words('git commit -m "fix; ls cleanup"')).toEqual([["git", "commit", "-m", "fix; ls cleanup"]]);
		expect(words("echo 'a && b' \"c | d\"")).toEqual([["echo", "a && b", "c | d"]]);
		expect(words("sleep 1 & echo done")).toEqual([["sleep", "1"], ["echo", "done"]]);
	});

	test("only the first stage of a pipeline is kept, and the statement says so", () => {
		const [s] = statements("grep -rn foo . | head -5 | wc -l");
		expect(s!.words.map((w) => w.text)).toEqual(["grep", "-rn", "foo", "."]);
		expect(s!.piped).toBe(true);
		expect(statements("a |& b")[0]!.piped).toBe(true);
		expect(statements("a")[0]!.piped).toBe(false);
	});

	test("expansions stay inside their word", () => {
		expect(words('echo $(ls; ls) x `ls; ls` ${A:-b c} "$(ls | wc)"')).toEqual([["echo", "$(ls; ls)", "x", "`ls; ls`", "${A:-b c}", "$(ls | wc)"]]);
		expect(words("echo $(echo '(' ) y")).toEqual([["echo", "$(echo '(' )", "y"]]);
		expect(words("echo $(unterminated")).toEqual([["echo", "$(unterminated"]]);
		expect(words("echo `unterminated")).toEqual([["echo", "`unterminated"]]);
		expect(words("echo ${unterminated")).toEqual([["echo", "${unterminated"]]);
	});

	test("escapes and quotes: raw keeps the original, text is what the program sees", () => {
		const [s] = statements('grep a\\ b \'c d\' "e\\"f" x\\\ny');
		expect(s!.words.map((w) => w.text)).toEqual(["grep", "a b", "c d", 'e"f', "xy"]);
		expect(s!.words.map((w) => w.raw)).toEqual(["grep", "a\\ b", "'c d'", '"e\\"f"', "x\\\ny"]);
		expect(words("echo 'unterminated")).toEqual([["echo", "unterminated"]]);
		expect(words('echo "unterminated')).toEqual([["echo", "unterminated"]]);
		expect(statements('echo "unterminated')[0]!.words[1]!.end).toBe('echo "unterminated'.length);
		expect(words("echo trailing\\")).toEqual([["echo", "trailing\\"]]);
	});

	test("heredoc bodies are not commands, including <<- and quoted delimiters", () => {
		expect(words("cat <<EOF\nls -la\ngrep -r x .\nEOF\nrg y")).toEqual([["cat"], ["rg", "y"]]);
		expect(words("cat <<-'END'\n\tls\n\tEND\necho after")).toEqual([["cat"], ["echo", "after"]]);
		expect(words('cat <<"X" > f\nls\nX\necho ok')).toEqual([["cat"], ["echo", "ok"]]);
		expect(words("cat <<EOF\nnever closed\nls")).toEqual([["cat"]]);
		expect(words("cat <<<ls\nls -l")).toEqual([["cat"], ["ls", "-l"]]);
	});

	test("comments are ignored", () => {
		expect(words("echo hi # ls -l\nrg x")).toEqual([["echo", "hi"], ["rg", "x"]]);
	});

	test("redirections are kept apart from the words, targets included", () => {
		const [s] = statements("grep -rn foo . 2>/dev/null > out.txt &>log 2>&1 < in");
		expect(s!.words.map((w) => w.text)).toEqual(["grep", "-rn", "foo", "."]);
		expect(s!.redirects.map((w) => w.raw)).toEqual(["2>/dev/null", ">", "out.txt", "&>log", "2>&1", "<", "in"]);
		expect(statements("cat <<EOF\nx\nEOF")[0]!.redirects.map((w) => w.raw)).toEqual(["<<EOF"]);
		expect(statements("a | b > c")[0]!.redirects).toEqual([]);
		expect(statements("a | cat <<EOF\nx\nEOF")[0]!.redirects).toEqual([]);
	});

	test("every word knows where it sits in the original", () => {
		const c = "cd src && grep -rn 'a b' .";
		const [, g] = statements(c);
		expect(g!.words.map((w) => c.slice(w.start, w.end))).toEqual(["grep", "-rn", "'a b'", "."]);
	});

	test("empty and whitespace-only commands have no statements", () => {
		expect(statements("")).toEqual([]);
		expect(statements("  \n ; ")).toEqual([]);
	});
});

describe("program", () => {
	test("skips variable assignments and takes the basename", () => {
		const ws = (c: string) => statements(c)[0]!.words;
		expect(program(ws("FOO=1 BAR=2 ls -l"))).toEqual({ index: 2, name: "ls" });
		expect(program(ws("/usr/bin/grep -r x"))).toEqual({ index: 0, name: "grep" });
		expect(program(ws("A=1"))).toBeUndefined();
		expect(program([])).toBeUndefined();
	});
});
