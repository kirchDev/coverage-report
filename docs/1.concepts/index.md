---
title: 'Concepts'
description: 'How coverage-report models a report, and how it decides which lines a pull request is answerable for.'
---

# Concepts

Two ideas carry the whole tool. Everything else — the parsers, the renderer, the GitHub calls — is mechanical once these two are settled.

- [The report model](1.the-report-model.md) — the one shape four formats collapse into, and why merging is a single operation.
- [Patch coverage](2.patch-coverage.md) — turning a unified diff into "which changed lines are still uncovered".
