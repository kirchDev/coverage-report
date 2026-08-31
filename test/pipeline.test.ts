import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { buildReport } from '../src/pipeline.ts';
import { present } from './helpers.ts';

const ROOT = join(import.meta.dirname, '..');
const FIXTURES = join(import.meta.dirname, 'fixtures');
const CLI = join(ROOT, 'src', 'bin.ts');

const REPORTS = [
  join(FIXTURES, 'sample.lcov.info'),
  join(FIXTURES, 'sample.clover.xml')
];

function cli(args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

const [FIRST_REPORT, SECOND_REPORT] = REPORTS as [string, string];

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
    const patch = present(result.patch, 'patch coverage');
    assert.deepEqual([patch.covered, patch.total], [1, 1]);
    assert.deepEqual(
      patch.files.map((file) => file.path),
      ['src/calculator.js']
    );
  });

  it('reads the base state and reports the movement', async () => {
    const result = await buildReport({
      reports: REPORTS,
      root: '/build/workspace',
      base: join(FIXTURES, 'base-state.json')
    });

    const delta = present(result.delta, 'delta');
    assert.equal(present(delta.metrics.lines, 'lines delta').pct, 37.5);
    assert.equal(delta.base.sha, 'basesha1');
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
      'render',
      '--root',
      '/build/workspace',
      '--report',
      REPORTS.join(',')
    ]);
    assert.match(output, /5\/8 lines/);
  });

  it('takes several reports as positional arguments', () => {
    const output = cli(['render', '--root', '/build/workspace', ...REPORTS]);
    assert.match(output, /5\/8 lines/);
  });

  it('renders for a terminal unless asked for the comment body', () => {
    // A human at a shell is the one who types this; markdown tables and a
    // <details> block are what a forge renders, not what a terminal does.
    const args = ['render', '--root', '/build/workspace', ...REPORTS];

    const text = cli(args);
    assert.equal(text.includes('<details>'), false);
    assert.match(text, /^Coverage\s+62\.50%/);

    const markdown = cli([...args, '--format', 'markdown']);
    assert.ok(markdown.startsWith('<!-- coverage-report -->'));

    const json = JSON.parse(cli([...args, '--format', 'json'])) as {
      totals: { lines: { covered: number } };
    };
    assert.equal(json.totals.lines.covered, 5);
  });

  it('names the formats it knows rather than printing an empty report', () => {
    assert.throws(
      () => cli(['render', '--report', FIRST_REPORT, '--format', 'html']),
      /Expected one of text, markdown, json/
    );
    assert.throws(
      () =>
        cli(['render', '--report', FIRST_REPORT, '--input-format', 'jacoco']),
      /Expected one of lcov, cobertura, clover, istanbul/
    );
  });

  it('refuses a repeated --report rather than silently keeping the last one', () => {
    // The failure this prevents: half a monorepo measured, and a comment that
    // looks entirely healthy about it.
    assert.throws(
      () =>
        cli(['render', '--report', FIRST_REPORT, '--report', SECOND_REPORT]),
      /comma-separated/
    );
  });

  it('exits non-zero when a threshold is missed, so it works as a gate', () => {
    assert.throws(
      () =>
        cli([
          'render',
          '--root',
          '/build/workspace',
          '--report',
          REPORTS.join(','),
          '--min-total',
          '99'
        ]),
      (error: unknown) => (error as { status?: number }).status === 1
    );
  });

  it('exits zero when the thresholds are met', () => {
    const output = cli([
      'render',
      '--root',
      '/build/workspace',
      '--report',
      REPORTS.join(','),
      '--min-total',
      '50'
    ]);
    assert.match(output, /62\.50%/);
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
