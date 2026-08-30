import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildReport } from '../src/pipeline.js';

const ROOT = join(import.meta.dirname, '..');
const FIXTURES = join(import.meta.dirname, 'fixtures');
const CLI = join(ROOT, 'bin', 'coverage-report.js');

const REPORTS = [
  join(FIXTURES, 'sample.lcov.info'),
  join(FIXTURES, 'sample.clover.xml')
];

function cli(args, options = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
}

describe('buildReport', () => {
  it('merges every report given to it into one set of totals', async () => {
    const result = await buildReport({
      reports: REPORTS,
      root: '/build/workspace'
    });

    assert.deepEqual(result.totals.lines, { covered: 5, total: 8, pct: 62.5 });
    assert.deepEqual(
      result.sources.map((source) => source.format),
      ['lcov', 'clover']
    );
  });

  it('measures patch coverage against a diff, ignoring what the diff cannot measure', async () => {
    const result = await buildReport({
      reports: REPORTS,
      root: '/build/workspace',
      diff: join(FIXTURES, 'sample.diff')
    });

    // The diff adds line 2 of src/calculator.js, which lcov records as run, and
    // one line of README.md, which no coverage report has anything to say
    // about. Only the first is counted, either way.
    assert.deepEqual([result.patch.covered, result.patch.total], [1, 1]);
    assert.deepEqual(
      result.patch.files.map((file) => file.path),
      ['src/calculator.js']
    );
  });

  it('reads the base state and reports the movement', async () => {
    const result = await buildReport({
      reports: REPORTS,
      root: '/build/workspace',
      base: join(FIXTURES, 'base-state.json')
    });

    assert.equal(result.delta.metrics.lines.pct, 37.5);
    assert.equal(result.delta.base.sha, 'basesha1');
  });

  it('reports a missed threshold without throwing, so the caller decides', async () => {
    const result = await buildReport({
      reports: REPORTS,
      root: '/build/workspace',
      thresholds: { total: 90 }
    });

    assert.equal(result.failures.length, 1);
    assert.match(result.markdown, /🔴 Lines/);
  });

  it('refuses to report on nothing', async () => {
    await assert.rejects(
      () => buildReport({ reports: [] }),
      /At least one coverage report/
    );
  });
});

describe('the command line', () => {
  it('names the format of each report it is given', () => {
    const output = cli(['detect', ...REPORTS]);
    assert.match(output, /sample\.lcov\.info: lcov/);
    assert.match(output, /sample\.clover\.xml: clover/);
  });

  it('takes several reports as one comma-separated value', () => {
    const output = cli([
      'report',
      '--root',
      '/build/workspace',
      '--report',
      REPORTS.join(',')
    ]);
    assert.match(output, /2079|5 \/ 8/);
  });

  it('takes several reports as positional arguments', () => {
    const output = cli(['report', '--root', '/build/workspace', ...REPORTS]);
    assert.match(output, /5 \/ 8/);
  });

  it('refuses a repeated --report rather than silently keeping the last one', () => {
    // The failure this prevents: half a monorepo measured, and a comment that
    // looks entirely healthy about it.
    assert.throws(
      () => cli(['report', '--report', REPORTS[0], '--report', REPORTS[1]]),
      /comma-separated/
    );
  });

  it('exits non-zero when a threshold is missed, so it works as a gate', () => {
    assert.throws(
      () =>
        cli([
          'report',
          '--root',
          '/build/workspace',
          '--report',
          REPORTS.join(','),
          '--min-total',
          '99'
        ]),
      (error) => error.status === 1
    );
  });

  it('exits zero when the thresholds are met', () => {
    const output = cli([
      'report',
      '--root',
      '/build/workspace',
      '--report',
      REPORTS.join(','),
      '--min-total',
      '50'
    ]);
    assert.match(output, /🟢 Lines/);
  });

  it('writes the base state the next run reads back', () => {
    const directory = mkdtempSync(join(tmpdir(), 'coverage-report-test-'));
    const output = join(directory, 'base.json');

    try {
      cli([
        'merge',
        '--root',
        '/build/workspace',
        '--report',
        REPORTS.join(','),
        '--ref',
        'dev',
        '--output',
        output
      ]);
      const summary = JSON.parse(readFileSync(output, 'utf8'));

      assert.equal(summary.schemaVersion, 1);
      assert.equal(summary.ref, 'dev');
      assert.deepEqual(summary.totals.lines, {
        covered: 5,
        total: 8,
        pct: 62.5
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
