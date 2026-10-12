# Changelog

## [0.4.0](https://github.com/kirchDev/coverage-report/compare/v0.3.0...v0.4.0) (2026-10-12)


### ⚠ BREAKING CHANGES

* move to pnpm 12
* this repository now requires pnpm 12.

### Features

* **ci:** call the central release-please and npm publish bodies ([6117c33](https://github.com/kirchDev/coverage-report/commit/6117c33dc0f884b3a0b34637f2410e24224e6970))
* **ci:** call the central workflow bodies instead of copying them ([0991427](https://github.com/kirchDev/coverage-report/commit/0991427999c122e054bf1f8a482418478411e63d))


### Bug Fixes

* **ci:** bump the workflow bodies to v0.1.3 ([c05472d](https://github.com/kirchDev/coverage-report/commit/c05472d899b206e80fd0a437d5d56dcce6a3edfd))
* **ci:** derive the prerelease base from the latest release ([51208cf](https://github.com/kirchDev/coverage-report/commit/51208cfb9a459858d315c25a3ffc0ccd454fca21))
* **ci:** pin the bodies to the v0.1.0 SHA in full ([ad19621](https://github.com/kirchDev/coverage-report/commit/ad196212dfc1a278925227aa83738d634a1adf64))
* **ci:** pin the workflow bodies to v0.2.0 and drop paths-ignore ([1caf2d0](https://github.com/kirchDev/coverage-report/commit/1caf2d02956c544cba0225a97fdcc3d9a892075d))
* **ci:** pin the workflow bodies to v0.5.0 ([c3bdbef](https://github.com/kirchDev/coverage-report/commit/c3bdbefbbf263cf41ba337834a31e72234b2e0e1))
* **ci:** pin the workflow bodies to v0.7.0 ([98986a6](https://github.com/kirchDev/coverage-report/commit/98986a6567c2fac6897a44a537fddfc3fe665a3b))
* **ci:** publish prereleases only from main ([0890964](https://github.com/kirchDev/coverage-report/commit/089096416401b309a264889a0e4a68f62028d296))
* **config:** correct the codex policy match examples ([dec02b4](https://github.com/kirchDev/coverage-report/commit/dec02b4f1ca9135793b9aa8b19e3fc4f60da96c0))


### Reverts

* go back to pnpm 11.25.0 ([73cbf7a](https://github.com/kirchDev/coverage-report/commit/73cbf7ab7ef639d10bd6322a468c5210c774ee58))


### Miscellaneous Chores

* move to pnpm 12 ([d71ee36](https://github.com/kirchDev/coverage-report/commit/d71ee365aa9e109b8c775c477d1443eea629bef7))
* move to pnpm 12 ([ee57c6c](https://github.com/kirchDev/coverage-report/commit/ee57c6c6cb663835239c3318632b1ca284e9b3a6))

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
