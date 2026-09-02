# Changelog

## [0.3.1](https://github.com/kirchDev/coverage-report/compare/v0.3.0...v0.3.1) (2026-08-31)


### Bug Fixes

* **ci:** derive the prerelease base from the latest release ([51208cf](https://github.com/kirchDev/coverage-report/commit/51208cfb9a459858d315c25a3ffc0ccd454fca21))

## [0.3.0](https://github.com/kirchDev/coverage-report/compare/v0.2.0...v0.3.0) (2026-08-31)


### ⚠ BREAKING CHANGES

* **cli:** `render` prints the terminal report instead of the comment body — pass `--format markdown` for the previous default. The `--json` and `--text` switches are gone, replaced by `--format text|markdown|json`. Forcing the format of the reports being read moves from `--format` to `--input-format`, and the action's `format` input is renamed to `input-format` with it.

### Features

* **cli:** default to the terminal report and rename the input format flag ([c0a578b](https://github.com/kirchDev/coverage-report/commit/c0a578b064258a96c7d9f2417e5c03514b4b6619))
* **render:** add a terminal report beside the comment body ([7242684](https://github.com/kirchDev/coverage-report/commit/7242684d2c161c57af7a0cae5915412c1b5520ca))

## [0.2.0](https://github.com/kirchDev/coverage-report/compare/v0.1.0...v0.2.0) (2026-08-30)


### Features

* publish the CLI as @kirchdev/coverage-report ([d1b1d4f](https://github.com/kirchDev/coverage-report/commit/d1b1d4fd15c0d2d455eda9f3cd292b3554e15f03))

## 0.1.0 (2026-08-30)


### Features

* **action:** comment and check-run coverage on a pull request ([d32c8f5](https://github.com/kirchDev/coverage-report/commit/d32c8f5164956e78fda0a3403b612e85b091b032))
* **cli:** add the coverage-report command line ([3863455](https://github.com/kirchDev/coverage-report/commit/38634553f4d8dbad71779cea56936027cacb160d))
* **cli:** rename the report command to render ([8a1de6b](https://github.com/kirchDev/coverage-report/commit/8a1de6be4c6c0a799e4501e4f98787e9bcc71ae2))
* **diff:** map a pull request's changed lines onto line hits ([6e55753](https://github.com/kirchDev/coverage-report/commit/6e55753de7c80586f521ce7854b5dc00ffc4b9c3))
* **parsers:** read lcov, cobertura, clover and istanbul into one shape ([83b1b1d](https://github.com/kirchDev/coverage-report/commit/83b1b1dd01f397bb9e439f17b77e05937def2ac3))
* **render:** render the sticky comment and the check-run summary ([13760ec](https://github.com/kirchDev/coverage-report/commit/13760eca936a0e61aa4883289db107dee031799a))
* type the tool ([e9011d1](https://github.com/kirchDev/coverage-report/commit/e9011d1b31aaff34c5fb4da7dcbc590d374649a0))


### Bug Fixes

* **action:** keep free-form text out of GITHUB_OUTPUT ([20d8f05](https://github.com/kirchDev/coverage-report/commit/20d8f0589560d49c70e2690be5b373abcf30c96f))
* **action:** make the GITHUB_OUTPUT delimiter unguessable ([8467340](https://github.com/kirchDev/coverage-report/commit/846734092adf3fd416709cc653f0126355144ded))
* **ci:** create the coverage directory before writing the report into it ([3fec171](https://github.com/kirchDev/coverage-report/commit/3fec17168ea08bec55049e9ed4d5f805b7e75e49))
* **ci:** point the merge queue at the current Bitwarden secret ([046e10c](https://github.com/kirchDev/coverage-report/commit/046e10c77d54bf0b636c622108368ae9a3d219d3))
* **ci:** point the release workflow at the current Bitwarden secret ([6c64a29](https://github.com/kirchDev/coverage-report/commit/6c64a29765f025583e3201a24de42478aa6134a2))
* **parsers:** scan attributes instead of matching them with a pattern ([821b4b0](https://github.com/kirchDev/coverage-report/commit/821b4b0f484e6ed43beb5347a675276e6978d797))
* **parsers:** stop the attribute pattern backtracking over a name run ([642ddde](https://github.com/kirchDev/coverage-report/commit/642ddde470dc6294b46f2db2ce90123221da4c13))
* **release:** pin the first release to 0.1.0 ([94f891c](https://github.com/kirchDev/coverage-report/commit/94f891ced581b401a87173e512b675bdde8101e7))

## Changelog
