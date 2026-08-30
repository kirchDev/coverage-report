---
title: 'Ship the action with almost no dependencies'
description: 'Keep the bundled action free of runtime dependencies beyond the CLI framework, and commit the bundle.'
status: 'accepted'
date: '2026-08-30'
---

# ADR-0003 — Ship the action with almost no dependencies

## Context

A GitHub Action runs on someone else's runner, in their repository, holding a token that can comment on pull requests and write to branches. Whatever the action's entry point imports runs there too.

A `node24` action executes the single file `action.yml` points at, from a checkout with no `node_modules`, so the entry point is either bundled or its dependencies are vendored. Either way, what is in the tree is what runs — there is no lockfile resolution between the pull request and the runner.

The obvious dependencies for this kind of work are an Actions toolkit, an XML parser and an HTTP client.

## Decision

We will take one runtime dependency, the CLI framework, and write the rest: the handful of workflow commands the action uses, a tag scanner for the two XML formats, and requests through the platform's own `fetch`. The bundle is built with a build-time dependency and committed, and a check proves the committed bundle is what the current source produces.

## Consequences

Every byte a consumer executes is reviewable in the pull request that introduced it, and the supply chain for a security-sensitive artifact is one package deep.

The written pieces are ours to maintain and ours to get wrong. Each is small and each is bounded by what this project uses — the tag scanner is not an XML parser and must not be pointed at arbitrary XML.

`dist/` is a second source of truth with a silent failure mode: a fix lands in the source, nobody rebuilds, and consumers keep running the old bundle while the pull request that fixed it is green. The check that rebuilds and compares is what turns that into a red one, and it is load-bearing rather than tidy.

Adding a runtime dependency later is a decision with a cost attached, not a default.

## Alternatives considered

**The Actions toolkit for inputs, outputs and logging.** The standard choice, and it would have been a few lines shorter. What it provides here is five functions over a documented text protocol and two append-only files — code that has not needed to change in years, against a monthly stream of dependency updates on an artifact where every update has to be reviewed as executable code.

**An XML parser.** Correct in general, and unnecessary here: Cobertura and Clover put every number this tool reads in an attribute, with no mixed content and no namespaces that matter. A scanner that walks tags in document order covers both formats completely.
