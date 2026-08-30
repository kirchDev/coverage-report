---
title: 'Store the base coverage on an orphan branch'
description: 'Keep the integration branch coverage the delta compares against in the repository, as commits on an orphan branch.'
status: 'accepted'
date: '2026-08-30'
---

# ADR-0002 — Store the base coverage on an orphan branch

## Context

"How did this change move coverage" needs the integration branch's number, and a pull-request run has no way to know it: it measures its own head and nothing else. Every surveyed alternative — the actions that render a delta at all — takes that number as a file path and leaves producing the file to the workflow author, which is to say the problem is unsolved rather than solved elsewhere.

The requirement that ruled the shortest paths out is that no coverage data may leave the workflow for a third-party service. That is the project's reason to exist, so a hosted store was never a candidate.

## Decision

We will keep the base state in the repository, on an orphan branch (`coverage` by default), one commit per measured push, with the summary keyed by branch name. It is written through the Git Data API, because that is the only interface that can create a commit with no parent.

A pull request reads the state for the branch it targets and never writes one.

## Consequences

The delta needs no service, no artifact retention window and no token beyond the one the workflow already has. The history is readable with ordinary tools: `git log` on that branch is the record of how a branch's coverage moved.

The branch shares no history with the code, so it cannot be merged into it by accident, and it does not appear in a `git log` of the code.

The action needs `contents: write`, which a pull request from a fork does not get. A repository that cannot grant it switches the base state off with an empty `base-branch` and keeps the total and patch coverage without the delta.

A pull request never records a base state, because recording one would make every branch its own baseline and every delta zero.

## Alternatives considered

**The last successful run's artifact, fetched through the API.** No branch to carry, and the data is already being produced. Artifacts expire — ninety days by default, less where a repository shortens it — so the delta stops working on a quiet branch without anything failing. Worse, re-running an old workflow makes an old artifact the most recent one, and the comparison silently regresses to a number from months ago.

**Recomputing the base on every pull request.** Always correct and always current, with no storage of any kind. It also runs the whole suite twice on every pull request, which doubles the cost of the thing the coverage report is supposed to make cheap.
