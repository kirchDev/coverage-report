<div align="center">

# 🧰 coverage-report

**Coverage on your pull requests — total, delta and patch — straight from the reports your CI already writes**

[![npm Version](https://img.shields.io/npm/v/@kirchdev/coverage-report.svg?style=flat-square&color=4f46e5)](https://www.npmjs.com/package/@kirchdev/coverage-report)
[![Downloads](https://img.shields.io/npm/dm/@kirchdev/coverage-report.svg?style=flat-square&color=4f46e5)](https://www.npmjs.com/package/@kirchdev/coverage-report)
[![Tests](https://img.shields.io/github/actions/workflow/status/kirchDev/coverage-report/ci.yml?branch=main&style=flat-square&label=tests)](https://github.com/kirchDev/coverage-report/actions/workflows/ci.yml)
[![Node Version](https://img.shields.io/node/v/@kirchdev/coverage-report.svg?style=flat-square&color=8993be)](https://www.npmjs.com/package/@kirchdev/coverage-report)
[![License: MIT](https://img.shields.io/npm/l/@kirchdev/coverage-report.svg?style=flat-square&color=10b981)](LICENSE)

![coverage-report merging two reports and printing total and patch coverage in a terminal](.github/assets/demo.gif)

</div>

---

```yaml
- uses: kirchDev/coverage-report@v0.1.0
  with:
    reports: |
      coverage/lcov.info   # Vitest
      coverage.xml         # Pest
    min-patch: '80'
```

That's it. One sticky comment and one check run, built from the reports the run already produced — no Codecov, no Coveralls, no coverage data leaving the workflow.

## 🤔 Why

Coverage comments without Codecov already exist several times over — `davelosert/vitest-coverage-report-action`, `romeovs/lcov-reporter-action`, `irongut/CodeCoverageSummary`, `5monkeys/cobertura-action`. So the first task here was not to build but to run them against a real repository, with Vitest and Pest side by side and a real pull request. Four gaps came back, and they are the whole scope: **each reads one format family** (fed PHPUnit's actual Clover file: `Parsing Error: Overall line rate not found`), **none merges two suites into one number** except `CodeCoverageSummary`, which is Cobertura-only, has no comment, and whose merged branch figure contradicts its own numerator, **none fetches the base value** — the two that render a delta take it as a file path you have to produce — and **none computes patch coverage**: `file-coverage-mode: changes` and `only_changed_files` filter by changed *file* and still list the whole file's uncovered lines.

## 📦 Install & run

Nothing to install. Add the step, and grant it three permissions:

```yaml
permissions:
  contents: write # only for the coverage branch holding the base state
  pull-requests: write # the sticky comment
  checks: write # the check run

steps:
  - uses: actions/checkout@v6
  - run: pnpm vitest run --coverage --coverage.reporter=lcov
  - uses: kirchDev/coverage-report@v0.1.0
    with:
      reports: coverage/lcov.info
```

> [!IMPORTANT]
> Neither the tag nor the npm package exists yet — pin `@main` for the Action until `v0.1.0` is released. There is no floating `@v0` or `@v1` tag and there will not be one: a 0.x minor is allowed to break, so a tag that follows it would promise more than the version does.

The same run locally — the CLI is the Action without its GitHub half, which is what makes a disagreement between a local check and a pull-request comment debuggable:

```bash
pnpm add -D @kirchdev/coverage-report   # or npx @kirchdev/coverage-report

coverage-report render coverage/lcov.info coverage.xml \
  --diff <(git diff origin/dev...HEAD) --min-patch 80
```

The parsers, the merge and the diff mapping are importable too, if you want the numbers rather than the markdown:

```js
import { buildReport } from '@kirchdev/coverage-report';
```

Worked workflows: [one suite](examples/single-format.yml), [Vitest and Pest merged into one number](examples/monorepo-two-languages.yml), [two reports kept deliberately apart](examples/two-separate-reports.yml), [no base state at all](examples/no-base-state.yml), [the CLI](examples/cli.sh).

## ✨ Features

- **Four formats, one run** — lcov, Cobertura, Clover and Istanbul `coverage-final.json`, detected by content rather than file name, because `coverage.xml` is Clover in a Laravel repo and Cobertura in a .NET one.
- **One number for a monorepo** — the JS report and the PHP report merge into a single total, and a line covered by two suites counts once.
- **Patch coverage that means it** — the diff is mapped onto line hits, so "still uncovered" names lines the change actually touched, not the other four hundred in the file.
- **The base state stays in the repository** — the integration branch's coverage is committed to an orphan branch, so the delta needs no third-party service and no artifact retention window.
- **A comment and a check run** — one marker-keyed sticky comment, edited rather than piled up, plus a check run for branch protection to gate on.
- **Thresholds that gate, or don't** — `min-total` and `min-patch` fail the run; without them the check concludes neutral rather than showing a green tick nobody earned.

<details>
<summary>What each number counts</summary>

- **Total** — every line the reports carry, merged. A line covered by two suites counts once; a file with nothing measurable in it counts as covered, so adding an empty barrel file does not drag the total down.
- **Patch** — of the lines this pull request added or changed, the ones the suite executed. A changed line no report mentions (a blank line, a comment, an import, a closing brace) counts neither way, so a formatting commit does not look uncovered.
- **Delta** — the total against the base state recorded on the integration branch. No base means no delta, which is the honest answer on a repository's first run.

</details>

## ⚙️ Configuration

`reports` is the only required input; [`action.yml`](action.yml) owns the full list and its defaults. The three that change behaviour rather than wording:

- `min-total` / `min-patch` — fail below this percentage. A change with nothing measurable in it never fails `min-patch`.
- `name` — set it when a repository posts more than one report, so each gets its own comment, check run and base state.
- `base-branch` — the orphan branch holding the base state, `coverage` by default. An empty string switches the delta off and drops the `contents: write` requirement.

<details>
<summary>Where the base number lives, and why there</summary>

"How did coverage move" needs the integration branch's value, and there were three ways to get it:

| Option | Cost |
| :--- | :--- |
| **An orphan `coverage` branch** — one commit per measured push | A branch in the repository, and `contents: write` |
| The last successful run's artifact, via the API | Artifacts expire, and a re-run of an old workflow resurrects an old number |
| Recompute the base on every pull request | Always correct, and doubles CI time on every run |

This ships the first. The branch shares no history with the code, so it cannot be merged into it by accident; each write is one commit with the previous state as its parent, so `git log coverage` is a readable history of a branch's coverage. The summary is plain JSON — the same file `coverage-report merge` writes locally.

</details>

## 🧪 Testing

```bash
pnpm test           # node:test, no test framework to keep current
pnpm check:types    # tsc --noEmit — Node runs TypeScript but never checks it
pnpm test:coverage  # this repository measures itself with itself
```

`dist/index.js` is committed, because a `node24` action runs the file `action.yml` points at from a checkout with no `node_modules`. `pnpm check:dist` rebuilds it into a temporary file and compares, so a bundle that has drifted from `src/` fails CI instead of shipping.

The npm package is a separate build (`pnpm build:npm` → `lib/`, run automatically on `prepack`). It cannot ship the TypeScript sources: Node refuses to strip types under `node_modules`, so a package whose entry points at a `.ts` file fails on the consumer's first import.

## 🤝 Contributing

PRs welcome. Conventional Commits required (enforced via commitlint). Husky runs the project's linters/formatters on `git commit`.

> [!TIP]
> Run `pnpm check:fix` before pushing — CI will catch what husky missed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## 🛣️ Versioning

[Semantic Versioning](https://semver.org/) via [release-please](https://github.com/googleapis/release-please) — see [CHANGELOG.md](CHANGELOG.md).

## 📄 License

[MIT](LICENSE) © [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev)
