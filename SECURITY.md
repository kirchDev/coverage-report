# Security Policy

## Scope

`coverage-report` is a **CLI plus the GitHub Action that wraps it**. It parses coverage reports produced by your own CI, maps a pull request's diff onto them, and writes a comment and a check run back to the repository. It runs inside the workflow with a repository token, and coverage data never leaves it for a third-party service.

The supported version is always the **latest release**. There are no maintained release branches to back-port fixes to; pin the Action to a major tag and update to the newest release when an advisory ships.

## Reporting a Vulnerability

**Please do not file a public GitHub issue for security problems.**

In the context of this project, a "vulnerability" typically means:

- A path in the Action that could leak the repository token or another secret into logs, a comment, or a check run.
- Untrusted input from a coverage report, a diff, or a pull-request title reaching a shell, a file write, or rendered markup unescaped.
- An insecure default in the shipped `action.yml` or the example workflows (e.g. overly broad `permissions`, or running on `pull_request_target` where `pull_request` would do).
- A dependency in `package.json` that introduces a known CVE.

Use one of the following private channels:

1. **GitHub Private Vulnerability Reporting** (preferred): open a private advisory at <https://github.com/kirchDev/coverage-report/security/advisories/new>.
2. **Email**: [titus.kirch@kirch.dev](mailto:titus.kirch@kirch.dev). PGP available on request.

Please include:

- A description of the vulnerability and its impact on repositories running the Action.
- Steps to reproduce.
- Any suggested fix, if you have one.

### What to expect

| Stage                        | Target timeline                                   |
| :--------------------------- | :------------------------------------------------ |
| Acknowledgement of report    | within **3 business days**                        |
| Initial assessment & triage  | within **7 business days**                        |
| Patch released (if accepted) | depends on severity — critical issues prioritised |
| Public disclosure & advisory | coordinated with reporter after the patch ships   |

## Credit

Reporters who follow this process responsibly are credited in the [CHANGELOG](CHANGELOG.md) and the corresponding GitHub Security Advisory, unless they prefer to remain anonymous.

---

Maintained by [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev).
