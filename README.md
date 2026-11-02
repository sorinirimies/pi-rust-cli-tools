# pi-rust-cli-tools

[![npm](https://img.shields.io/npm/v/pi-rust-cli-tools.svg)](https://www.npmjs.com/package/pi-rust-cli-tools)
[![CI](https://github.com/sorinirimies/pi-rust-cli-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/sorinirimies/pi-rust-cli-tools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Audit](https://github.com/sorinirimies/pi-rust-cli-tools/actions/workflows/security.yml/badge.svg)](https://github.com/sorinirimies/pi-rust-cli-tools/actions/workflows/security.yml)
[![Fuzz](https://github.com/sorinirimies/pi-rust-cli-tools/actions/workflows/fuzz.yml/badge.svg)](https://github.com/sorinirimies/pi-rust-cli-tools/actions/workflows/fuzz.yml)

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that steers the agent to fast modern CLI tools (`rg`, `fd`, `lsd`, ...) **only when they are installed**.

## What it does

1. **Detects** which of `rg fd bat lsd eza sd dust procs hyperfine tokei delta difft jq just rtk` are on `PATH` (once per session).
2. **Tells the agent** which are installed, in a few lines of the system prompt.
3. **Rewrites** a bash call that has an installed replacement, before it runs, so the agent never pays for a retry:

| Agent runs | Runs instead | Needs |
|---|---|---|
| `grep -rn foo src` (also `-R`, `--recursive`, `egrep`, `fgrep`) | `rg -n foo src` | `rg` |
| `find . -name '*.ts' -type f` (also `-iname`, `-maxdepth`, `-mindepth`) | `fd -t f -g '*.ts' .` | `fd` |
| `ls -la src` | `lsd -la src` | `lsd` |

Details that keep the meaning intact:

* `rg` and `fd` skip hidden and git-ignored files, `grep -r` and `find` do not. That is the point (no `node_modules`, no `target/`), but search an ignored path with `/rust-cli-tools mode off` or `grep off`.

* grep flags map one to one (`-i -w -l -c -v -F -P -o -q`, `-A/-B/-C N`, `-m N`, `-e`, `-f`, `--include`/`--exclude`/`--exclude-dir` to `-g`), `-n` is added so the output has line numbers, and a path is always named (`rg` would read stdin otherwise).
* Only the command is rewritten: quotes, redirections, pipes, `cd x &&` and the rest of the line stay as they were.
* A basic regex (grep without `-E`) is spelled for rg: `grep -rn 'fn main()'` becomes `rg -n 'fn main\(\)'`, since `( ) + ? | { }` are plain characters to grep and operators to rg. `-x`/`--line-regexp` maps to `-x`.
* What cannot be said the same way (a GNU regex like `\(a\|b\)`, a back-reference, patterns from `-f` in a basic regex, `find -o`, `-path`, an unknown flag) is **blocked** with a hint instead, and the agent retries by hand.
* Plain `ls`, `du`, `ps`, `grep` without `-r`, `find -exec/-delete/-mtime/...` and anything inside a quote, a heredoc or `$(...)` are left alone. `ls -l | wc -l` is left alone too (`ls -l` prints a `total` line).

## Modes and settings

| Command | |
|---|---|
| `/rust-cli-tools status` | settings, installed tools, how many commands were rewritten |
| `/rust-cli-tools mode [rewrite\|block\|hint\|off]` | `rewrite` (default) runs the modern tool; `block` refuses with a hint; `hint` only tells the model; `off` does nothing |
| `/rust-cli-tools on` / `off` | the same as `mode rewrite` / `mode off` |
| `/rust-cli-tools [grep\|find\|ls] [on\|off]` | switch one rule |

Settings are saved in `<agent dir>/rust-cli-tools.json` (the agent dir is `PI_CODING_AGENT_DIR`, then `$XDG_CONFIG_HOME/pi/agent`, then `~/.pi/agent`). The status line shows `cli: N rewritten`.

Works together with [pi-squeeze](https://github.com/sorinirimies/pi-squeeze): this plugin decides which command runs, pi-squeeze shrinks its output (`rg -n`, `fd` and `lsd -l` results are compacted).

## Install

```bash
pi install npm:pi-rust-cli-tools
```

Install the tools themselves, for example: `brew install ripgrep fd lsd`.

## Development

```bash
bun install
just check   # typecheck + tests (95% coverage gate) + pack check + nu script tests
```

## License

MIT
