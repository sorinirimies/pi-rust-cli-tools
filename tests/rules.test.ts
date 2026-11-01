import { describe, expect, test } from "bun:test";
import { applyEdits, findings, quote, RULES, type Rule } from "../extensions/core/rules.ts";

const all = new Set(["rg", "fd", "lsd", "eza"]);
const on: Record<Rule, boolean> = { grep: true, find: true, ls: true };

/** What the plugin would do: the rewritten command, "stuck" when a hint is all it can give, undefined when it leaves the command alone. */
function plan(command: string, have: ReadonlySet<string> = all, enabled = on): string | undefined {
	const f = findings(command, have, enabled);
	if (!f.length) return undefined;
	if (f.some((x) => !x.edits)) return "stuck";
	return applyEdits(command, f.flatMap((x) => x.edits!));
}

describe("grep -r becomes rg", () => {
	test.each([
		["grep -rn foo src", "rg -n foo src"],
		["grep -r foo src", "rg -n foo src"],
		["grep -R foo .", "rg -n foo ."],
		["grep --recursive foo .", "rg -n foo ."],
		["grep -rin 'a b' lib", "rg -i -n 'a b' lib"],
		["grep -rn foo", "rg -n foo ."],
		["/usr/bin/grep -rn foo .", "rg -n foo ."],
		["grep -rl foo .", "rg -l foo ."],
		["grep -rL foo .", "rg --files-without-match foo ."],
		["grep -rc foo .", "rg -c foo ."],
		["grep -rq foo .", "rg -q foo ."],
		["grep -rnw foo .", "rg -n -w foo ."],
		["grep -rnv foo .", "rg -n -v foo ."],
		["grep -rnF 'a.b' .", "rg -n -F 'a.b' .".replace("-F -n", "-F -n")],
		["grep -rnE 'a|b' .", "rg -n 'a|b' ."],
		["grep -rnP '\\d+' .", "rg -n -P '\\d+' ."],
		["grep -rnH foo .", "rg -n -H foo ."],
		["grep -rnh foo .", "rg -n --no-filename foo ."],
		["grep -rns foo .", "rg -n --no-messages foo ."],
		["grep -rnI foo .", "rg -n foo ."],
		["grep -rno foo .", "rg -n -o foo ."],
		["grep -rna foo .", "rg -n -a foo ."],
		["grep -rn -A3 foo .", "rg -n -A 3 foo ."],
		["grep -rn -A 3 -B2 -C 1 foo .", "rg -n -A 3 -B 2 -C 1 foo ."],
		["grep -rn -m5 foo .", "rg -n -m 5 foo ."],
		["grep -rn -e foo -e bar .", "rg -n -e foo -e bar ."],
		["grep -rn -efoo .", "rg -n -e foo ."],
		["grep -rn -f pats.txt .", "rg -n -f pats.txt ."],
		["grep -rn --include='*.ts' foo .", "rg -n -g '*.ts' foo ."],
		["grep -rn --include '*.ts' foo .", "rg -n -g '*.ts' foo ."],
		["grep -rn --exclude=*.min.js foo .", "rg -n -g '!*.min.js' foo ."],
		["grep -rn --exclude-dir=node_modules foo .", "rg -n -g '!node_modules' foo ."],
		["grep -rn --color=always foo .", "rg -n --color=always foo ."],
		["grep -rn --color foo .", "rg -n --color=auto foo ."],
		["grep -rn --colour=never foo .", "rg -n --color=never foo ."],
		["grep -rn --binary-files=without-match foo .", "rg -n foo ."],
		["grep -rn --binary-files text foo .", "rg -n -a foo ."],
		["grep -rn --line-number --ignore-case foo .", "rg -n -i foo ."],
		["grep -rn --word-regexp --invert-match foo .", "rg -n -w -v foo ."],
		["grep --recursive --files-with-matches --count foo .", "rg -l -c foo ."],
		["grep -rn --files-without-match --fixed-strings foo .", "rg -n --files-without-match -F foo ."],
		["grep -rn --perl-regexp x .", "rg -n -P x ."],
		["grep -rn --extended-regexp 'a|b' .", "rg -n 'a|b' ."],
		["grep -rn --regexp=foo --file=p .", "rg -n -e foo -f p ."],
		["grep -rn --max-count=3 --after-context=1 --before-context=2 --context=3 x .", "rg -n -m 3 -A 1 -B 2 -C 3 x ."],
		["grep -rn --with-filename --no-filename --only-matching --quiet --silent --text --no-messages --line-buffered x .", "rg -n -H --no-filename -o -q -a --no-messages --line-buffered x ."],
		["grep -rn --dereference-recursive x .", "rg -n -L x ."],
		["grep -rn -- -x .", "rg -n -- -x ."],
		["egrep -rn 'a|b' .", "rg -n 'a|b' ."],
		["fgrep -rn 'a.b' .", "rg -F -n 'a.b' ."],
		["grep -rn foo . | head -5", "rg -n foo . | head -5"],
		["cd src && grep -rn foo .", "cd src && rg -n foo ."],
		["grep -rn foo . 2>/dev/null", "rg -n foo . 2>/dev/null"],
		["grep -rn foo 2>/dev/null .", "rg -n foo . 2>/dev/null"],
		["FOO=1 grep -rn foo .", "FOO=1 rg -n foo ."],
		["grep -rn foo . ; grep -rn bar .", "rg -n foo . ; rg -n bar ."],
	])("%s", (cmd, want) => {
		expect(plan(cmd)).toBe(want);
	});

	test("a basic regex with GNU escapes cannot be rewritten, so it is left to the agent", () => {
		for (const c of ["grep -rn 'a\\|b' .", "grep -rn '\\(a\\)' .", "grep -rn 'a\\{2\\}' .", "grep -rn '\\<word\\>' .", "grep -rn '\\(a\\)\\1' .", "grep -rn 'a\\+' .", "grep -rn -e 'a\\?' ."]) expect(plan(c)).toBe("stuck");
		expect(plan("grep -rnE 'a\\|b' .")).toBe("rg -n 'a\\|b' .");
	});

	test("flags without a safe equivalent are left to the agent", () => {
		for (const c of ["grep -rn --null foo .", "grep -rnZ foo .", "grep -rn --binary-files=foo x .", "grep -rn --unknown x .", "grep -rn -A", "grep -rn --include", "grep -rnT x .", "grep -rn"]) expect(plan(c)).toBe("stuck");
	});

	test("not recursive, not grep, or no rg: nothing to do", () => {
		for (const c of ["grep foo file.txt", "grep -n foo file", "cat f | grep -r x", "git grep foo", "rg foo", "echo grep -r"]) expect(plan(c)).toBeUndefined();
		expect(plan("grep -rn foo .", new Set(["fd"]))).toBeUndefined();
		expect(plan("grep -rn foo .", all, { ...on, grep: false })).toBeUndefined();
		expect(plan("grep -- -r foo .")).toBeUndefined();
	});

	test("quotes and heredocs are not commands", () => {
		for (const c of ['git commit -m "fix; grep -r x ."', "echo 'a && grep -rn x .'", "cat <<EOF\ngrep -rn x .\nEOF", "echo $(echo grep -rn x .)"]) expect(plan(c)).toBeUndefined();
	});
});

describe("find -name becomes fd", () => {
	test.each([
		["find . -name '*.ts'", "fd -g '*.ts' ."],
		["find src -iname '*.RS'", "fd -i -g '*.RS' src"],
		["find src lib -name '*.ts'", "fd -g '*.ts' src lib"],
		["find . -type f", "fd -t f . ."],
		["find -type d", "fd -t d ."],
		["find src -type f -name '*.ts'", "fd -t f -g '*.ts' src"],
		["find . -maxdepth 2 -type l", "fd -d 2 -t l . ."],
		["find . -mindepth 1 -maxdepth 1 -name x", "fd --min-depth 1 -d 1 -g x ."],
		["find . -name x -print", "fd -g x ."],
		["find . -name x | head", "fd -g x . | head"],
		["cd a && find . -name x 2>/dev/null", "cd a && fd -g x . 2>/dev/null"],
	])("%s", (cmd, want) => {
		expect(plan(cmd)).toBe(want);
	});

	test("anything fd cannot say the same is left to the agent", () => {
		for (const c of ["find . -name a -name b", "find . -name a -o -name b", "find . -type x", "find . -type", "find . -name", "find . -maxdepth x -name a", "find . -path '*/x' -name y", "find . ! -name x", "find . -newer f -name x"]) expect(plan(c)).toBe("stuck");
	});

	test("exec, delete, size, mtime and perm are never touched; no name or type means nothing to gain", () => {
		for (const c of ["find . -name x -exec rm {} \\;", "find . -type f -delete", "find . -mtime -1 -type f", "find . -size +1M -name x", "find . -perm 644 -type f", "find . -maxdepth 1", "find .", "fd x"]) expect(plan(c)).toBeUndefined();
		expect(plan("find . -name x", new Set(["rg"]))).toBeUndefined();
		expect(plan("find . -name x", all, { ...on, find: false })).toBeUndefined();
	});
});

describe("ls -l becomes lsd -l", () => {
	test.each([
		["ls -l", "lsd -l"],
		["ls -la src", "lsd -la src"],
		["ls -lhA", "lsd -lhA"],
		["ls -ltr dir1 dir2", "lsd -ltr dir1 dir2"],
		["cd x && ls -l", "cd x && lsd -l"],
		["FOO=1 ls -l", "FOO=1 lsd -l"],
		["ls -l 2>/dev/null", "lsd -l 2>/dev/null"],
	])("%s", (cmd, want) => {
		expect(plan(cmd)).toBe(want);
	});

	test("plain ls is already small and is left alone, so is a piped ls", () => {
		for (const c of ["ls", "ls -a", "ls src", "ls -l | wc -l", "ls | wc -l"]) expect(plan(c)).toBeUndefined();
	});

	test("flags lsd does not share, or only eza installed: a hint at most", () => {
		expect(plan("ls -lG")).toBe("stuck");
		expect(plan("ls -l --color=never")).toBe("stuck");
		expect(plan("ls -l", new Set(["eza"]))).toBe("stuck");
		expect(plan("ls -l", new Set(["rg"]))).toBeUndefined();
		expect(plan("ls -l", all, { ...on, ls: false })).toBeUndefined();
		expect(findings("ls -l", new Set(["eza"]), on)[0]!.hint).toContain("`eza`");
		expect(findings("ls -l", all, on)[0]!.hint).toBe("Use `lsd` instead of ls -l (e.g. `lsd -la`).");
	});
});

describe("findings", () => {
	test("each rule has its own hint", () => {
		expect(findings("grep -rn x .", all, on)[0]!.hint).toContain("rg");
		expect(findings("find . -name x", all, on)[0]!.hint).toContain("fd");
		expect(RULES).toEqual(["grep", "find", "ls"]);
	});

	test("every statement is judged on its own", () => {
		expect(plan("grep -rn a . && find . -name b && ls -l")).toBe("rg -n a . && fd -g b . && lsd -l");
		expect(plan("grep -rn a . && find . -name b -o -name c")).toBe("stuck");
	});

	test("a statement without a program, or an unknown one, is ignored", () => {
		expect(plan("A=1")).toBeUndefined();
		expect(plan("")).toBeUndefined();
		expect(plan("cargo build")).toBeUndefined();
	});
});

describe("quote and applyEdits", () => {
	test("plain words stay, others are single-quoted", () => {
		expect(quote("a/b-c.ts")).toBe("a/b-c.ts");
		expect(quote("*.ts")).toBe("'*.ts'");
		expect(quote("it's")).toBe("'it'\\''s'");
		expect(quote("")).toBe("''");
	});

	test("edits apply from the end, leaving the rest of the command alone", () => {
		expect(applyEdits("aaa bbb ccc", [{ start: 0, end: 3, text: "X" }, { start: 8, end: 11, text: "ZZZZ" }])).toBe("X bbb ZZZZ");
		expect(applyEdits("abc", [])).toBe("abc");
	});
});
