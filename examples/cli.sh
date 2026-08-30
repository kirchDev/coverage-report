#!/usr/bin/env bash
# The CLI does everything the Action does except talk to GitHub, which is what
# makes a disagreement between a local run and a pull-request comment debuggable.
set -euo pipefail

# Which format is this file, actually? (Detection is by content, not extension.)
coverage-report detect coverage/lcov.info coverage.xml

# The comment body, printed rather than posted. Reports are positional, so a
# glob works: coverage-report render coverage/*.info
coverage-report render coverage/lcov.info coverage.xml \
  --root "$(git rev-parse --show-toplevel)"

# The same run against a pull request's diff, with thresholds. Exits non-zero
# when a threshold is missed, so it works as a pre-push gate.
git diff origin/dev...HEAD > /tmp/pr.diff
coverage-report render coverage/lcov.info coverage.xml \
  --diff /tmp/pr.diff \
  --min-patch 80

# The base state the Action stores on its orphan branch is just this file.
coverage-report merge coverage/lcov.info coverage.xml \
  --ref dev --sha "$(git rev-parse HEAD)" \
  --output coverage-base.json
