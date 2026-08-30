import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reportTotals, toSummary } from '../src/coverage.ts';
import { coverageDelta, patchCoverage } from '../src/patch.ts';
import { present, reportOf } from './helpers.ts';
import {
  marker,
  renderCheckSummary,
  renderMarkdown,
  thresholdFailures
} from '../src/render.ts';

const report = reportOf({ 'src/a.js': { 1: 1, 2: 0, 3: 1, 4: 0 } });
const totals = reportTotals(report);
const patch = patchCoverage(report, new Map([['src/a.js', new Set([1, 2])]]));

describe('the comment body', () => {
  it('opens with the marker that makes the comment sticky', () => {
    // Found by this string on the next push, and edited rather than added to.
    assert.ok(renderMarkdown({ totals }).startsWith(marker()));
  });

  it('gives a named report its own marker, so two reports do not fight', () => {
    assert.ok(
      renderMarkdown({ totals, name: 'php' }).includes(
        '<!-- coverage-report:php -->'
      )
    );
    assert.notEqual(marker('php'), marker());
  });

  it('states the total with its covered-of-total counts', () => {
    const body = renderMarkdown({ totals });
    assert.match(body, /Lines \| 50\.00% \| 2 \/ 4/);
  });

  it('renders patch coverage separately from the total', () => {
    const body = renderMarkdown({ totals, patch });
    assert.match(body, /Patch coverage: 50\.00%\*\* \(1 \/ 2 changed lines\)/);
  });

  it('names the uncovered changed lines and nothing else', () => {
    // Line 4 is uncovered too, and is not in the diff. The file's row lists the
    // changed line 2 and stops there — that is the whole difference between
    // patch coverage and a changed file's coverage.
    const row = present(
      renderMarkdown({ totals, patch })
        .split('\n')
        .find((line) => line.includes('`src/a.js`')),
      'the row for src/a.js'
    );

    assert.deepEqual(
      row.split('|').map((cell) => cell.trim()),
      ['', '`src/a.js`', '50.00%', '2', '']
    );
  });

  it('says so plainly when nothing measurable changed', () => {
    const body = renderMarkdown({
      totals,
      patch: patchCoverage(report, new Map())
    });
    assert.match(
      body,
      /No changed line in this pull request carries coverage data/
    );
  });

  it('shows a delta only once there is a base to compare against', () => {
    const base = toSummary(
      reportOf({ 'src/a.js': { 1: 1, 2: 0, 3: 0, 4: 0 } }),
      { sha: 'abc1234', ref: 'dev' }
    );
    const body = renderMarkdown({ totals, delta: coverageDelta(totals, base) });

    assert.match(body, /▲ \+25\.00%/);
    assert.match(body, /Compared against `abc1234` on `dev`/);
  });

  it('leaves the change column empty rather than claiming ±0 with no base', () => {
    assert.match(renderMarkdown({ totals }), /\| – \|/);
  });

  it('stays neutral where no threshold was configured', () => {
    // A red circle beside a number nobody promised to hit trains reviewers to
    // ignore the comment.
    const body = renderMarkdown({ totals });
    assert.ok(body.includes('⚪'));
    assert.ok(!body.includes('🔴'));
  });

  it('marks a missed threshold red and a met one green', () => {
    assert.match(
      renderMarkdown({ totals, thresholds: { total: 80 } }),
      /🔴 Lines/
    );
    assert.match(
      renderMarkdown({ totals, thresholds: { total: 40 } }),
      /🟢 Lines/
    );
  });

  it('links file paths when it knows the commit', () => {
    const body = renderMarkdown({
      totals,
      patch,
      commit: 'abc123',
      repositoryUrl: 'https://github.com/o/r'
    });
    assert.match(
      body,
      /\[`src\/a\.js`\]\(https:\/\/github\.com\/o\/r\/blob\/abc123\/src\/a\.js\)/
    );
  });

  it('is stable across renders, so an unchanged run does not edit the comment', () => {
    assert.equal(
      renderMarkdown({ totals, patch }),
      renderMarkdown({ totals, patch })
    );
  });
});

describe('thresholds', () => {
  it('reports nothing to fail when none were set', () => {
    assert.deepEqual(thresholdFailures({ totals, patch, thresholds: {} }), []);
  });

  it('fails on the total and on the patch independently', () => {
    assert.equal(
      thresholdFailures({ totals, patch, thresholds: { total: 90 } }).length,
      1
    );
    assert.equal(
      thresholdFailures({ totals, patch, thresholds: { patch: 90 } }).length,
      1
    );
    assert.equal(
      thresholdFailures({ totals, patch, thresholds: { total: 90, patch: 90 } })
        .length,
      2
    );
  });

  it('does not fail a patch threshold when the change had nothing to measure', () => {
    // Otherwise a documentation-only pull request fails a coverage gate.
    const empty = patchCoverage(report, new Map());
    assert.deepEqual(
      thresholdFailures({ totals, patch: empty, thresholds: { patch: 90 } }),
      []
    );
  });
});

describe('the check-run summary', () => {
  // It takes no thresholds by signature — the check run appends the failures as
  // a list beneath this line, and a summary that repeated them printed each one
  // twice. That is now a type error rather than a test.
  it('fits on one line beside twenty other checks', () => {
    const summary = renderCheckSummary({ totals, patch });
    assert.equal(summary.includes('\n'), false);
    assert.match(summary, /Lines 50\.00% \(2\/4\) · patch 50\.00% \(1\/2\)/);
  });
});
