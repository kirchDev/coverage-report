---
title: 'Write the tool in TypeScript and check it with tsc'
description: 'Run TypeScript directly on Node and keep tsc as the thing that actually checks it.'
status: 'accepted'
date: '2026-08-30'
---

# ADR-0004 — Write the tool in TypeScript and check it with tsc

## Context

The tool's core is a set of maps handed between parsers, a merge, a diff reader and a renderer, where the failure mode is a number that is quietly wrong rather than a crash. The rest of the estate is TypeScript; this repository was written in JavaScript, with the shapes described in prose and held together by tests.

Node 24 runs TypeScript by erasing the types, with no flag and no build step. Erasing is all it does: a program whose types are wrong runs exactly as before. That makes running and checking two separate decisions rather than one, and the second one is where the value is.

Only erasable syntax survives that path. `enum`, `namespace` and parameter properties are rejected at load with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.

## Decision

We will write the tool in TypeScript, run it on Node with no transpile step, and take `typescript` as a build-time dependency so `tsc --noEmit` can check it. The check is part of the repository's one gate. `erasableSyntaxOnly` is on, so the compiler rejects the syntax the runtime cannot load.

Relative imports name the `.ts` file, because Node's module resolver does not guess extensions.

## Consequences

The shapes that were prose are now checked: what a parser returns, what the renderer accepts, what the base state holds. A test asserting on a metric that does not exist stops compiling.

There is a devDependency and a check step that did not exist before, and a contributor who runs only the tests gets no type feedback at all — `pnpm check` is what makes the types mean anything.

Two TypeScript features are unavailable, and the compiler says so rather than the runtime.

Nothing about the shipped artifact changes: the action is bundled as before, and the bundler reads TypeScript without extra configuration.

## Alternatives considered

**Staying on JavaScript with JSDoc types.** No dependency at all, and `tsc` can check JSDoc — so the checking argument does not separate the two. What separates them is that JSDoc puts the shapes in comments, where they are read as documentation and drift as documentation does, and the estate's other repositories would still be the only ones with types in the code.

**TypeScript with a transpile step for the CLI as well as the action.** The conventional setup, and it would put a build between an edit and a test run for the half of the tool that has no build today. The action already has one because a bundle is what an action runs; the CLI does not need one now that the runtime reads the source.
