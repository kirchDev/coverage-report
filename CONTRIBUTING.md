# Contributing to coverage-report

Thanks for taking the time to contribute! 🛠️ This document covers what you need to get a PR landed.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Reporting issues

- **Questions & ideas, or something that might be a bug**: start in the [Discord forum](https://discord.kirch.dev/) — that's where the low-friction, unconfirmed stuff lives.
- **Confirmed bugs**: open a [Bug report](https://github.com/kirchDev/coverage-report/issues/new?template=bug_report.yml) with a minimal reproduction if at all possible.
- **Feature requests**: open a [Feature request](https://github.com/kirchDev/coverage-report/issues/new?template=feature_request.yml).
- **Security vulnerabilities**: **do not** open a public issue. Follow [SECURITY.md](SECURITY.md).

## Development setup

Requirements:

- Node **24+** and **pnpm 11**
- `git`

Clone and install:

```bash
git clone https://github.com/kirchDev/coverage-report.git
cd coverage-report
pnpm install   # wires husky hooks
```

## Running the suite

| Command             | What it does                                                      |
| :------------------ | :---------------------------------------------------------------- |
| `pnpm lint`         | oxlint across the repo.                                           |
| `pnpm format`       | oxfmt check across JS / TS / JSON / YAML / MD.                    |
| `pnpm check:types`  | `tsc --noEmit`. Node runs TypeScript but never checks it.         |
| `pnpm check:policy` | Proves the two agent policy files ban the same commands.          |
| `pnpm check`        | Runs lint, format, types, policy, bundle and tests — the CI gate. |
| `pnpm check:fix`    | Auto-fix lint + format issues.                                    |

The same commands run in CI — keep them green before you push.

## Branching & PRs

1. **Don't push directly to `main` or `dev`.** Branch off `dev` and open the PR against `dev`; `dev` rolls up into `main`, and release-please releases from there.
2. **Conventional Commits required.** Commitlint enforces this on every commit. Examples:
   - `feat(parser): read cobertura reports`
   - `fix(diff): map renamed files onto their new line numbers`
   - `docs(readme): document the base-state options`
   - `chore(deps): bump oxlint to 1.76`
   - Breaking changes: `feat!: ...` or include `BREAKING CHANGE:` in the body.
3. **One concern per PR.** Smaller PRs land faster.
4. **Update relevant docs.** README, CONTRIBUTING, or comments if you change a default.

## Style & quality gates

Husky runs the following on `git commit`:

- **JS / TS / JSON / YAML / MD** → `oxlint` + `oxfmt`

If a hook fails, fix the issue and commit again. **Don't `--no-verify`** unless I explicitly ask.

> [!TIP]
> Run `pnpm check:fix` before opening a PR — saves a CI cycle.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
