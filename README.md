# pi-rust-cli-tools

[![npm](https://img.shields.io/npm/v/pi-rust-cli-tools.svg)](https://www.npmjs.com/package/pi-rust-cli-tools)
[![CI](https://github.com/sorinirimies/pi-rust-cli-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/sorinirimies/pi-rust-cli-tools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that steers the agent to fast modern CLI tools (`rg`, `fd`, `lsd`, `eza`, `dust`, `procs`, ...) **only when they are installed**.

## What it does

1. **Detects** which of `rg fd bat lsd eza sd dust procs hyperfine tokei delta difft jq just` are on `PATH` (once per session).
2. **Tells the agent** by appending a short "installed / not installed" paragraph to the system prompt.
3. **Blocks** a direct bash call that has an installed replacement and returns a hint, so the agent retries:

| Blocked | Hint | Needs |
|---|---|---|
| `grep -r`, `grep -R`, `grep --recursive` | `rg` | `rg` |
| `find ... -name/-iname/-type` | `fd` | `fd` |
| `ls` | `lsd` (or `eza`) | `lsd` / `eza` |
| `du` | `dust -d1` | `dust` |
| `ps` | `procs` | `procs` |

Never blocked: pipe filters (`git log | grep fix`), `find -exec/-delete/...`, `ls | wc -l`, and anything whose replacement is not installed. Nothing is installed or rewritten for you.

## Install

```bash
pi install npm:pi-rust-cli-tools
```

Install the tools themselves, for example: `brew install ripgrep fd bat lsd eza sd dust procs hyperfine tokei`.

## Development

```bash
bun install
just check   # typecheck + tests (95% coverage gate) + pack check + nu script tests
```

## License

MIT
