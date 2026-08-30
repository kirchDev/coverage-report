import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createReport,
  fileOf,
  mergeReports,
  percentage,
  recordHits,
  recordKey,
  reportTotals,
  toSummary
} from '../src/coverage.js';
import { coverageDelta, patchCoverage } from '../src/patch.js';

function reportOf(files) {
  const report = createReport();
  for (const [path, lines] of Object.entries(files)) {
    const file = fileOf(report, path);
    for (const [line, hits] of Object.entries(lines)) {
      recordKey(file.lines, Number(line));
      if (hits > 0) recordHits(file.lines, Number(line), hits);
    }
  }
  return report;
}

describe('merging', () => {
  it('adds up two reports covering different files — the monorepo case', () => {
    // The JS suite and the PHP suite become one number, which is the thing no
    // single existing action does.
    const js = reportOf({ 'src/a.js': { 1: 1, 2: 0 } });
    const php = reportOf({ 'app/B.php': { 1: 1, 2: 1, 3: 0 } });

    assert.deepEqual(reportTotals(mergeReports([js, php])).lines, {
      covered: 3,
      total: 5,
      pct: 60
    });
  });

  it('counts a line covered by either suite once, not twice', () => {
    // Two Vitest projects over the same file: the overlap must not inflate the
    // denominator, or a repository could raise its coverage by splitting a suite.
    const unit = reportOf({ 'src/a.js': { 1: 3, 2: 0, 3: 0 } });
    const component = reportOf({ 'src/a.js': { 1: 0, 2: 5, 3: 0 } });

    assert.deepEqual(reportTotals(mergeReports([unit, component])).lines, {
      covered: 2,
      total: 3,
      pct: 66.67
    });
  });

  it('keeps a line uncovered when no report covered it', () => {
    const one = reportOf({ 'src/a.js': { 7: 0 } });
    const two = reportOf({ 'src/a.js': { 7: 0 } });

    assert.deepEqual(reportTotals(mergeReports([one, two])).lines, {
      covered: 0,
      total: 1,
      pct: 0
    });
  });
});

describe('percentages', () => {
  it('calls a file with nothing to measure fully covered', () => {
    // The alternative drags the repository total down every time an empty
    // barrel file is added.
    assert.equal(percentage(0, 0), 100);
  });

  it('rounds to two places', () => {
    assert.equal(percentage(2, 3), 66.67);
  });
});

describe('patch coverage', () => {
  const report = reportOf({
    'src/a.js': { 1: 1, 2: 0, 3: 1, 400: 0 },
    'src/b.js': { 10: 0 }
  });

  it('counts only lines that are both changed and measurable', () => {
    const patch = patchCoverage(
      report,
      new Map([['src/a.js', new Set([1, 2, 3])]])
    );
    assert.deepEqual([patch.covered, patch.total, patch.pct], [2, 3, 66.67]);
  });

  it('leaves the rest of the file out of the number', () => {
    // Line 400 is uncovered and not in the diff. Reporting it against this
    // change is the mistake every existing action makes.
    const patch = patchCoverage(
      report,
      new Map([['src/a.js', new Set([1, 2, 3])]])
    );
    assert.deepEqual(patch.files[0].uncovered, [2]);
  });

  it('ignores a changed line the report says nothing about', () => {
    // Blank lines, comments, imports and closing braces. Counting them would
    // make every formatting commit look uncovered.
    const patch = patchCoverage(
      report,
      new Map([['src/a.js', new Set([1, 2, 3, 98, 99])]])
    );
    assert.equal(patch.total, 3);
  });

  it('ignores a changed file that carries no coverage at all', () => {
    const patch = patchCoverage(
      report,
      new Map([['README.md', new Set([1, 2])]])
    );
    assert.deepEqual(
      [patch.covered, patch.total, patch.files.length],
      [0, 0, 0]
    );
  });

  it('lists the worst file first, because that is what needs a test', () => {
    const patch = patchCoverage(
      report,
      new Map([
        ['src/a.js', new Set([1, 3])],
        ['src/b.js', new Set([10])]
      ])
    );

    assert.deepEqual(
      patch.files.map((file) => file.path),
      ['src/b.js', 'src/a.js']
    );
  });

  it('reports 100% when the change touched nothing measurable', () => {
    const patch = patchCoverage(report, new Map());
    assert.deepEqual([patch.total, patch.pct], [0, 100]);
  });
});

describe('delta against the base state', () => {
  const now = reportTotals(
    reportOf({ 'src/a.js': { 1: 1, 2: 1, 3: 0, 4: 0 } })
  );

  it('is null when the branch has never been measured', () => {
    // The first run on a repository, and every pull request into a branch with
    // no recorded base. A missing delta is an answer, not an error.
    assert.equal(coverageDelta(now, null), null);
  });

  it('reports the movement against the recorded totals', () => {
    const base = toSummary(
      reportOf({ 'src/a.js': { 1: 1, 2: 0, 3: 0, 4: 0 } }),
      { sha: 'abc' }
    );
    const delta = coverageDelta(now, base);

    assert.equal(delta.metrics.lines.pct, 25);
    assert.equal(delta.metrics.lines.before, 25);
    assert.equal(delta.base.sha, 'abc');
  });
});

describe('the base-state summary', () => {
  it('carries per-file totals and the commit it describes', () => {
    const summary = toSummary(reportOf({ 'src/a.js': { 1: 1, 2: 0 } }), {
      sha: 'abc123',
      ref: 'dev'
    });

    assert.equal(summary.schemaVersion, 1);
    assert.equal(summary.sha, 'abc123');
    assert.equal(summary.ref, 'dev');
    assert.deepEqual(summary.files['src/a.js'].lines, [1, 2]);
  });
});
