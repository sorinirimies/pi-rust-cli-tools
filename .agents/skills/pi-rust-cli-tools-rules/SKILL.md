---
name: pi-rust-cli-tools-rules
description: Rules for work in the pi-rust-cli-tools repository that the code can't show: constraints, ownership and must-keep behaviour. Use before changing, fixing, reviewing or extending code here, together with the typescript-in-projects skill.
---

# pi-rust-cli-tools: rules the code can't show

Hard constraints for this repository. The general conventions (orientation, tests,
scripting, releasing) are in the `typescript-in-projects` skill; this file holds only what is
specific to pi-rust-cli-tools.

* **Modes:** `rewrite` (default) mutates `input.command`; when no exact rewrite
  exists the call is blocked with a hint. `block` refuses, `hint` and `off` leave the
  command alone. Each rule toggles separately.
* **Exact or refuse.** Anything `rg`/`fd` would read differently is refused: BRE
  escapes beyond `basicToRg`, `-f` with a basic regex, back-references, `find -o`,
  `-path`, `-name` containing `/`. The real-tool test checks `rg` finds exactly the
  lines `grep` finds; add a pattern there with every regex change.
* `rg` always gets `-n` and an explicit path; a piped `ls -l` is left alone.
* `du` and `ps` are not blocked: `dust`/`procs` output is no smaller, so a block only
  costs a turn.
