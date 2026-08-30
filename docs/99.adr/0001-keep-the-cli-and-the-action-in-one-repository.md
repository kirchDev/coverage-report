---
title: 'Keep the CLI and the action in one repository'
description: 'Ship the coverage CLI and the GitHub Action that wraps it as one artifact rather than two.'
status: 'accepted'
date: '2026-08-30'
---

# ADR-0001 — Keep the CLI and the action in one repository

## Context

The work has two halves. One is pure computation — parsing reports, merging them, mapping a diff onto line hits, rendering markdown — and is useful outside GitHub Actions: at a shell, in a pre-push hook, on another forge. The other talks to GitHub: it upserts a comment, writes a check run, and reads and writes the base state.

Those halves have different audiences, which is the usual argument for two repositories. They also change together: every input the action gains is an argument the CLI needs, and every number the CLI computes is a number the comment prints.

## Decision

We will ship both from one repository. `action.yml` is a thin wrapper whose entry point calls the same modules the CLI drives, and both are released on one version line.

## Consequences

A single release covers both halves, so there is never a question about which CLI version an action tag pairs with, and a change to the shared computation cannot ship to one consumer and not the other.

The action is a bundled artifact rather than an installed package, so the repository carries a build step and a committed `dist/`. That cost is [ADR-0003](0003-ship-the-action-with-almost-no-dependencies.md)'s to price.

Consumers who want only the CLI take a repository that also contains an action, and consumers who want only the action take one that also publishes a command. Neither is asked to install the other.

## Alternatives considered

**Two repositories, the action depending on the published CLI.** Each half gets its own release line and its own README. It also gets a permanent compatibility question — which CLI version a given action tag pairs with — that has to be answered in documentation, tested in CI, and re-answered at every release. For a tool whose two halves have no independent reason to move, that is a cost with no matching benefit.

**A pure action, with no CLI.** Fewer moving parts, and untestable in the way that matters: the diff-to-line-hit mapping is the part most likely to be quietly wrong, and a pure action can only be exercised through a workflow run.
