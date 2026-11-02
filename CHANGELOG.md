# Changelog

Generated from [Conventional Commits](https://www.conventionalcommits.org) by
[git-cliff](https://git-cliff.org). Do not edit by hand.

## [0.1.3](https://github.com/sorinirimies/pi-rust-cli-tools/releases/tag/v0.1.3) — 2026-11-02


### ✨ Features

- Rewrite grep -r, find -name and ls -l to rg, fd and lsd instead of blocking; quote-aware parser; modes, persisted settings and /rust-cli-tools command ([`9be3c1d`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/9be3c1d5220243e3a703fc1b3b324197d5605ab0))

### 🐛 Fixes

- Spell a basic grep regex for rg so ( ) + ? | { } stay literal; map -x; refuse -f patterns and back-references that rg reads differently ([`64f67d8`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/64f67d894331997465379446840834c79e8906aa))
- **ci:** A 409 from the other host publishing the same version first is not a failure; add release-gitea-starscream and pull-gitea-starscream recipes ([`58b96c5`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/58b96c5c45f77041b1cc285d0f63e79b9d07c249))

### 📚 Docs

- **readme:** Add the Audit and Fuzz badges ([`d561c31`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/d561c313554273ec4f72657c267fabb2e9169953))
- Describe the rewrite behaviour and the ignored-files difference ([`11fcd48`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/11fcd48596466711732b948c758d98cb097ee77b))
- This repo's agent rules as a project skill in .agents/skills ([`77aea53`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/77aea53346135c5d177bd4aa7e5d36c26868e731))
- Drop the per-repo agent rules skill; the shared skills cover it ([`23069c3`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/23069c3647bf799b24ee2810494dd5d9ca91ddee))

### 🧪 Tests

- Seeded fuzz tests (FUZZ_ITERS / FUZZ_SEED; a failure prints the seed that reproduces it) ([`98410c3`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/98410c307d7cc838ef8e44c78ccc330a1dbc1014))

### 🔧 Build & CI

- Fuzz and Security workflows on GitHub and Gitea ([`abef557`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/abef557668292a22f681dd8b4c07f6a15ccc1cf3))
- **deps-dev:** Pin minimatch 11.0.3 via overrides ([`b015526`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/b01552652e82a7e2b987b3d38686160115cd4ced))
- Move to the Nushell template layout (scripts, workflows, justfile) ([`06ff3cc`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/06ff3cc98ab746c25964919a2d688040c5092c89))
- Cut a release from the Release workflow (bump, changelog, tag, push, publish) ([`4be5dad`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/4be5dad9638bad6efb66bffd55caafdb6d3ce9ef))

### 🧹 Chores

- Nightly dev-tooling lockfile update 2026-11-01 (not released) ([`b1e2bd3`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/b1e2bd3991afb1ad9930316eab38264e369954fc))
- Ignore .codegraph index ([`51d3dd3`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/51d3dd364059d351e17d2d5d4619a23d8ff18350))
## [0.1.2](https://github.com/sorinirimies/pi-rust-cli-tools/releases/tag/v0.1.2) — 2026-10-31


### 🔧 Build & CI

- One nightly (GitHub); Gitea mirrors GitHub's main and tags hourly ([`86cc490`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/86cc490c2a74a98e21cb10ba2272a0064590ac72))

### 🧹 Chores

- Nightly dev-tooling lockfile update 2026-10-31 (not released) ([`c2319a5`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/c2319a5d1ebcbc7fe787e91d9f18da3cb2842314))
- Nightly dev-tooling lockfile update 2026-10-31 (not released) ([`b764a9a`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/b764a9a3132cca2a553178bf901a4ef80981341b))
- Merge Gitea's main (both hosts ran their own nightly) ([`728f7cd`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/728f7cdfd4baae9a6700c2b5aaeaf0293fae90b9))
## [0.1.1](https://github.com/sorinirimies/pi-rust-cli-tools/releases/tag/v0.1.1) — 2026-10-30


### 🐛 Fixes

- Detect tools on Windows (no /bin/sh there: use `where`), and only look up plain tool names ([`e65ae9b`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/e65ae9bb22cc9432a38051838b5ba09ab50821a9))

### 🔧 Build & CI

- **deps:** Bump taiki-e/install-action from 2.87.31 to 2.87.32 (#1) ([`a1f75fd`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/a1f75fde7b9144fa1770c2c16871c2ae06684231))
- **deps-dev:** Pin undici 8.12.3 via overrides ([`dff6113`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/dff61132e21c4e4feded07c741c6aad26a6a938c))
- Keep .gitea workflow actions up to date; auto-merge needs GH_PAT for action bumps ([`89e7653`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/89e7653482c0d4aef69e1abc95447ad1b87838df))
- **deps:** Bump Gitea workflow actions ([`e3ed57c`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/e3ed57c46450430c46fc418106e7997738b32e85))
## [0.1.0](https://github.com/sorinirimies/pi-rust-cli-tools/releases/tag/v0.1.0) — 2026-10-30


### ✨ Features

- Initial release of pi-rust-cli-tools ([`78223c8`](https://github.com/sorinirimies/pi-rust-cli-tools/commit/78223c85b30ab3fb64f3bfd458c49b059abbcd25))

