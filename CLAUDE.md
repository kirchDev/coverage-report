# CLAUDE.md

This file provides guidance to AI coding agents — Claude Code (claude.ai/code) and vendor-neutral tools such as Codex, OpenCode, Cursor, and Copilot — when working with code in this repository.

## Agent instruction files

`CLAUDE.md` and `AGENTS.md` are kept **byte-identical**. `CLAUDE.md` is what Claude Code reads; `AGENTS.md` is what vendor-neutral agent tools read — Codex, OpenCode, Cursor, Copilot, and whatever follows them. Two real files, deliberately not a symlink: not every tool resolves one.

**After editing either file, copy it over the other — don't repeat the edit by hand:**

```bash
cp CLAUDE.md AGENTS.md   # or the reverse, whichever you just edited
```

Retyping a change is exactly how the two drift; one reflowed line or reworded clause is enough. `diff CLAUDE.md AGENTS.md` must print nothing. If it ever does, treat it as a defect and fix it by letting one file win wholesale — never by merging them.

## What this repo is

`coverage-report` is **self-hosted coverage reporting on pull requests**: a sticky comment and a check run carrying total coverage, how the change moves it, and which changed lines are still uncovered — built from the plain report formats CI already produces, with no third-party platform. No Codecov, no Coveralls. The raw material never leaves the runner.

It ships as **two halves in one repo**, deliberately not split:

- a **CLI** (citty, Node 24) — parsers for lcov / cobertura / clover / Istanbul `coverage-final.json`, a merge of several reports into one number, the mapping of a PR diff onto line hits (patch coverage), and markdown rendering. Testable and reusable outside Actions.
- a thin **`action.yml`** wrapper — calls the CLI, upserts the marker-keyed sticky comment, writes the check run, reads and writes the base state.

Splitting them would mean two release lines for one artifact and a permanent question about which version pairs with which.

The scope exists because no existing action covers the combination — measured, not assumed, against `kirchDev/app` (Vitest + Pest in one repo): every candidate reads exactly one format family, only `irongut/CodeCoverageSummary` merges several reports (cobertura only, no comment, and its merged branch figure is wrong), none obtains the base value itself, and none computes patch coverage — `file-coverage-mode: changes` and `only_changed_files` filter by changed *file* and still report the whole file's uncovered lines.

Two decisions that were the design risk, both now settled and both worth understanding before changing anything near them:

- **Base-coverage storage → an orphan `coverage` branch.** One commit per measured push, the summary keyed by branch, written through the Git Data API (the only one that can create a parentless commit). The alternatives were the last successful run's artifact — which expires, and which a re-run of an old workflow resurrects — and recomputing the base on every pull request, which is always correct and doubles CI time. The reasoning is in `src/github/base-state.ts`.
- **Diff → line-hit mapping.** The fiddly core, in `src/diff.ts`: only the new side of a hunk counts, context lines are not the patch, a rename is followed under its new name, and `\ No newline at end of file` never advances the counter. Every one of those is a test in `test/diff.test.ts`. Change it against the tests, never against judgement.

## Commands

| Command             | What it does                                                |
| :------------------ | :---------------------------------------------------------- |
| `pnpm install`      | Install deps and wire husky hooks via the `prepare` script  |
| `pnpm test`         | `node --test` — the suite, no test framework                |
| `pnpm check:types`  | `tsc --noEmit` — the only thing that checks the types       |
| `pnpm test:coverage`| The suite with coverage, into `coverage/lcov.info`          |
| `pnpm build`        | Bundle `src/action-entry.ts` into the committed `dist/`     |
| `pnpm check:dist`   | Prove `dist/` is what `src/` currently builds               |
| `pnpm lint`         | `oxlint . --deny-warnings`                                  |
| `pnpm format`       | `oxfmt --check .` (note: `format` is the check, not fix)    |
| `pnpm check`        | `lint` + `format` + `check:policy` + `check:dist` + `test` — the CI gate |
| `pnpm check:policy` | Proves the two agent policy files ban the same commands     |
| `pnpm lint:fix`     | Auto-fix lint                                               |
| `pnpm format:fix`   | Auto-fix format                                             |
| `pnpm check:fix`    | Auto-fix lint + format                                      |
| `pnpm skills:update`| Update project-scoped agent skills via the skills.sh CLI    |
| `pnpm taze`         | Interactive dependency upgrade check                        |
| `pnpm taze:w`       | Write upgrade results                                       |

**After changing anything under `src/`, run `pnpm build` and commit `dist/` in the same commit.** The bundle is a second source of truth and the failure mode is silent — a fix lands, nobody rebuilds, and every consumer keeps running the old bundle while the pull request that "fixed it" is green. `pnpm check:dist` is what turns that into a red check.

## Architecture / conventions

- **Layout.** `src/parsers/` (one file per format plus a shared tag scanner), `src/coverage.ts` (the one report shape everything speaks), `src/diff.ts` (unified diff → changed lines), `src/patch.ts`, `src/render.ts`, `src/pipeline.ts` (the whole job in one function, driven by both entry points), `src/github/` (the four endpoints the Action touches), `src/action.ts` + `src/action-entry.ts`, `src/cli.ts` + `bin/`.
- **One runtime dependency, on purpose.** `citty`, for the CLI. No `@actions/core` (the five things it does are ~40 lines in `src/workflow.ts`), no XML library (`src/parsers/xml.ts` is a tag scanner, and Cobertura and Clover are flat attribute formats), no HTTP client (Node 24 ships `fetch`). Every byte in `dist/` is code a consumer runs on their runner with a token, so the bar for adding one is high.
- **`dist/index.js` is committed and generated.** It is excluded from lint, format and lint-staged; editing it by hand breaks `pnpm check:dist`.
- **TypeScript, run by Node and checked by `tsc`.** Node 24 executes `.ts` by *erasing* types — it never checks them, so a type error runs happily. `pnpm check:types` is therefore the only thing standing between an annotation and a fiction, and it is part of `pnpm check`. `tsconfig.json` sets `erasableSyntaxOnly`, so syntax the runtime cannot strip (`enum`, `namespace`, parameter properties) fails the check instead of failing on someone's runner with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.
- **Relative imports name the `.ts` file.** Node's ESM loader does not guess extensions, and `rewriteRelativeImportExtensions` keeps `tsc` happy about it. There is no build step for the CLI: `bin/coverage-report.js` imports `../src/cli.ts` and Node strips it on load.
- **Tests are `node:test`.** No Vitest: this repo has no bundler, no JSX and no watch-mode need that the built-in runner does not cover, and it is one fewer toolchain to keep current on a repo whose whole point is not depending on things. `test/helpers.ts` holds the two things every test file wanted — `reportOf` and `present`.
- **Node 24, pnpm 11.** Pinned via `.nvmrc`, `engines`, and `packageManager`. `pnpm-workspace.yaml` enforces `minimumReleaseAge=4320` (3-day cooldown), isolated node-linker. Don't loosen these without reason.
- **oxc, not eslint/prettier.** Linting via `oxlint`, formatting via `oxfmt`. Configs live in `.oxlintrc.json` / `.oxfmtrc.json`. `oxlint` uses `unicorn` + `oxc` plugins; rules deliberately minimal.
- **Husky hooks** (`.husky/pre-commit`, `.husky/commit-msg`) run `lint-staged` and `commitlint`. `lint-staged.config.js` excludes `README.md`, `CLAUDE.md`, and `AGENTS.md` (free-form prose), `pnpm-lock.yaml`, and `dist/` (generated). `oxlint --fix --deny-warnings` then `oxfmt` on JS/TS; `oxfmt` only on JSON/YAML/MD.
- **Conventional Commits enforced** via `@commitlint/config-conventional`. Don't `--no-verify` unless explicitly asked.
- **release-please is included** (unlike many templates that omit it). Files: `release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/release-please.yml`. Config uses `release-type: node` (it bumps `package.json`), `include-v-in-tag: true`. This repo starts at `0.0.0` with an empty `CHANGELOG.md` — scaffold's history was deliberately not inherited. **`initial-version: 0.1.0` is load-bearing and not redundant:** with no tag and no release yet, release-please takes the *initial* path rather than bumping, so `bump-minor-pre-major` never applies and the default first version is `1.0.0`. The key is inert once the first release exists, so leave it.
- **Workflows** use `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v6`, `github/codeql-action/{init,analyze}@v4`. Keep these pinned to major versions; Dependabot bumps them monthly.
- **CodeQL** scans `actions` + `javascript-typescript` with `security-extended,security-and-quality` queries, gated by path filters so non-code changes don't trigger it.
- **Dependabot** groups all minor/patch updates per ecosystem into a single PR (`npm-minor-patch`, `actions-minor-patch`). Majors come as separate PRs.

## AI & skills

- **`.claude/settings.json`** ships a baseline permission policy — see _Permission policy_ below for the rules it follows. `.claude/settings.local.json` (per-machine overrides, typically `enabledMcpjsonServers`) is gitignored.
- **`.tituskirch-skills.json`** configures the [TitusKirch skills](https://github.com/TitusKirch/skills) (commit, PR, issue, release, docs …) per repo. It is the runtime **config**, not an installer. Regenerate/reconcile it with the `tituskirch-skills-config` skill.
- **Installing the skills.** The bundle is installed via the skills.sh CLI (`pnpm dlx skills add TitusKirch/skills`), not vendored into the repo. `pnpm skills:update` refreshes project-scoped skills tracked in `skills-lock.json` (only present once a repo actually installs project skills).

## Permission policy

`.claude/settings.json` is deliberately lopsided: a **long `deny` list and a short `allow` list**. The two sides answer different questions, so they follow opposite rules.

**`deny` may be generous.** A rule for a command the repo doesn't have is a no-op, it never needs maintenance, and it is never reviewed — a too-broad block only surfaces when you actually hit it. So the list covers every stack kirchDev repos might grow into (Laravel, Prisma, Terraform/OpenTofu, AWS), not just this one. `git reflog expire` and `git gc --prune=now` are in there because they destroy the rescue path that survives a `reset --hard`.

The line to draw is **the machine or something remote, not the working copy**. Blocked: anything that wrecks the OS (`dd`, `mkfs`, `chmod -R`, `rm -rf /…`), tears down remote state or resources (`terraform destroy`, `state rm`, `aws ec2 terminate-instances`, `gh repo delete`), or throws away work with no recovery path (force-push, `reset --hard`, `stash drop`). Deliberately *not* blocked, because they are ordinary local development: `rm -rf node_modules`, `docker volume rm`, `docker compose down -v`, `docker system prune`, `php artisan tinker`, deleting a remote branch. Those prompt instead — a command that is sometimes wanted belongs in the middle state, never in `deny`.

**`allow` must stay short.** Its only return is fewer prompts — no safety is gained. Every line has to be read and understood by whoever copies this file, and an unreviewed allow list is more dangerous than none. Keep what occurs many times per session (read-only git, `ls`/`grep`/`rg`, the project's own check scripts) and let everything else ask.

**Three states, not two.** A command in `allow` runs unasked; one in `deny` is impossible and has to be typed by hand; one in **neither list prompts you** — and that middle state is the right default for almost everything. Reserve `deny` for what a mistaken "yes" could not undo. A normal `git push` is not that: it is reversible, visible and the ordinary way work ships, so it sits in `allow`.

> [!IMPORTANT]
> **Never allow a rule that runs arbitrary code.** `php artisan tinker --execute`, `pnpm exec turbo run`, `find . *` (which covers `-delete` and `-exec rm`), a raw `pnpm dlx`, or an MCP tool that executes SQL (`database-query`, `run-query`) each hand back everything the `deny` list took away — a blocked `db:wipe` means nothing next to an allowed `tinker --execute 'DB::statement(...)'`. A deny list is only as strong as the weakest allow rule beside it.

Two things this file cannot do, by design: it cannot tell which branch a `git push` targets (protect release branches with **branch protection**, not permissions), and prefix rules miss flags placed before the subcommand (`docker compose -f x.yml down -v`). Treat it as lowering the odds, not as a guarantee.

The `deny` list is inherited from `scaffold` as-is and stays that way; the `allow` list carries this repo's own scripts, so extend it there when a new `pnpm` script becomes a per-session habit.

**Codex gets the same policy** in `.codex/rules/default.rules` — permission config is not portable, so the block list exists twice and **both must be changed together**. Codex uses Starlark `prefix_rule()` calls matching on argument *tokens*, which handles flags and shell chains that the `Bash(…)` prefix patterns miss, and every rule carries its own `match`/`not_match` cases. Check a rule with:

```bash
codex execpolicy check --pretty --rules .codex/rules/default.rules -- git push --force
```

**Parity between the two is machine-checked, not eyeballed.** `pnpm check:policy` (`scripts/check-policy-parity.js`, part of `pnpm check` and of CI) expands every `prefix_rule` into its concrete argv prefixes — the cartesian product over its alternation lists — and matches the two sets in both directions, so "we changed both files" becomes a number rather than a claim. Two things it encodes are worth knowing before editing either file:

- **The languages differ, so a few gaps cannot be closed.** Claude Code matches a prefix of the command _string_; a `prefix_rule` matches whole argv _tokens_. `Bash(aws iam delete-:*)` therefore bans every delete verb AWS will ever ship, and the Codex side can only enumerate the ones it ships today. Such a difference is legal but must be **declared** — in the `DELIBERATE` list in the script and in the `.codex/rules/default.rules` header — and the check fails both on an undeclared one and on a declaration that has gone stale.
- **Neither language normalises flag order or case.** `rm -rf /` and `rm -fr /` are separate bans; `rm -r -f /` and `redis-cli FlushAll` are neither, and enumerating permutations never ends. The check proves the two files list the **same spellings** — it does not claim the set of spellings is complete. Same caveat as the two below, and for the same reason.

## Branching model

This repo runs a **`dev` integration branch**: branch off `dev`, PR into `dev`, roll `dev` up into `main`, and release-please releases from `main`. That is what most kirchDev repos run, and `.tituskirch-skills.json` (`pr.base: dev`) and `.github/dependabot.yml` (`target-branch: 'dev'`) both assume it.

> [!IMPORTANT]
> This repo has the `dev` config but **no `dev` branch yet** — `git branch -a` shows only `main`. Create it before the first Dependabot run: with `target-branch: 'dev'` pointing at a branch that doesn't exist, Dependabot opens nothing at all. Going main-only (below) is a deliberate step too — leaving the config untouched is the one option that silently does nothing.

`.github/workflows/dev-pr.yml` opens and updates the rolling draft `dev` → `main` PR. Mark that PR ready and **merge it with a merge commit, never a squash**: squashing collapses the individual `feat:`/`fix:` commits into the PR's own `chore:` title, and release-please then cuts nothing.

Going **main-only** is three edits, all of them removals:

```bash
rm .github/workflows/dev-pr.yml
# .github/dependabot.yml    — drop both `target-branch: 'dev'` lines
# .tituskirch-skills.json   — set `pr.base` to "main"
```

`ci.yml` and `codeql.yml` list both `main` and `dev` in their `on: branches:` filters and neither edit touches them. A filter naming a branch that doesn't exist is a no-op, so it costs a main-only repo nothing — and without `dev` in `ci.yml`, PRs into `dev` (Dependabot's included) would run no CI at all.

## Visibility

This repo is **public**, and three defaults follow from that: `codeql.yml` runs (CodeQL is free on public repos only), the MIT `LICENSE` and the `[MIT](LICENSE) © …` README footer stay, and `.github/ISSUE_TEMPLATE/config.yml` points questions, ideas and possible bugs at the repo's Discord forum (provisioned from the `infrastructure` repo's OpenTofu). Confirmed bugs and features stay as the GitHub issue forms. Don't quietly flip any of the three — each one only makes sense for a public repo.

## House style for READMEs and meta files

`/write-readme` skill encodes the canonical structure. Key rules: hero block wrapped in `<div align="center">`, prescribed section emojis (✨ Features, 🚀 Setup, 🤝 Contributing, 🛣️ Versioning, 📄 License), license footer always reads `[MIT](LICENSE) © [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev)`. Use GitHub callouts (`> [!TIP]`, `> [!IMPORTANT]`), never plain blockquotes.

## When editing this repo

- This repo was created from the `scaffold` template. The meta layer above is the template's and the sections describing it still hold, but nothing here is a placeholder any more — every name, URL and description belongs to this repo. If a search for the old template slug turns up anything outside this sentence, it was missed.
- `forgemap` (sibling repo at `../forgemap`) is the de-facto reference implementation of these conventions. When unsure about a config choice, check what forgemap does.
- **Placement is not settled.** `ideas/reusable-ci.md` in `kirchDev/greenhouse` is a precondition for where the CI side of this lands: ship into `scaffold` first and this becomes the N+1th drifting copy; ship after, and it is a central workflow body with a thin caller stub. One interaction neither idea has resolved: reusable-ci's tree-hash markers skip a run whose bytes already passed, but a coverage report is an *artifact*, not a verdict — a skipped run produces none, so the sticky comment would be missing on exactly the PRs the markers make cheap. Either the artifact is recorded alongside the marker, or such a job opts out of the skip.
- The originating idea is `ideas/coverage-report.md` in `kirchDev/greenhouse`.
- **This repo reports its own coverage with itself**, from the checkout (`uses: ./` in `ci.yml`), so a change that breaks the Action fails before it can be tagged. That job passes `base-branch: ''` — the base state needs `contents: write`, which a pull request from a fork does not get.
