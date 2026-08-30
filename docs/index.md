---
title: 'coverage-report documentation'
description: 'How coverage-report turns the reports your CI already writes into one number, a delta and patch coverage.'
---

# coverage-report

coverage-report reads the coverage files a run already produced, merges them into one set of totals, maps a pull request's diff onto them, and writes the result back as a comment and a check run. These pages cover the parts that are decisions rather than code: the shape every format is reduced to, how a diff becomes a patch-coverage number, and how to teach it a format it does not know.

## Sections

- [Concepts](1.concepts/) — the report model and how patch coverage is computed.
- [Guides](2.guides/) — tasks, starting with adding a coverage format.
- [Architecture decisions](99.adr/) — the decision log.

Installation, the inputs and the worked workflows are not here: the [README](../README.md) covers the first, [`action.yml`](../action.yml) owns the inputs, and [`examples/`](../examples) holds the workflows.
