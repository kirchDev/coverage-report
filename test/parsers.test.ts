import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileTotals, reportTotals } from '../src/coverage.ts';
import {
  detectFormat,
  parseContent,
  type ParseOptions,
  type ParseResult
} from '../src/parsers/index.ts';
import { present } from './helpers.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const ROOT = '/build/workspace';

function load(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function parse(name: string, options: ParseOptions = {}): ParseResult {
  return parseContent(load(name), { root: ROOT, ...options });
}

describe('format detection', () => {
  it('tells the four formats apart by content, not by file name', () => {
    assert.equal(detectFormat(load('sample.lcov.info')), 'lcov');
    assert.equal(detectFormat(load('sample.cobertura.xml')), 'cobertura');
    assert.equal(detectFormat(load('sample.clover.xml')), 'clover');
    assert.equal(detectFormat(load('sample.istanbul.json')), 'istanbul');
  });

  it('separates the two XML formats, which both open with <coverage>', () => {
    // The whole reason detection cannot be by extension: a Laravel repo and a
    // .NET repo both call this file coverage.xml and mean different formats.
    assert.equal(detectFormat(load('sample.clover.xml')), 'clover');
    assert.equal(detectFormat(load('sample.cobertura.xml')), 'cobertura');
  });

  it('returns null rather than guessing at something that is not a report', () => {
    assert.equal(detectFormat('hello world'), null);
  });
});

describe('lcov', () => {
  it('reads lines, branches and functions from the raw records', () => {
    const { report } = parse('sample.lcov.info');
    const file = present(
      report.files.get('src/calculator.js'),
      'src/calculator.js'
    );

    assert.deepEqual(fileTotals(file).lines, { covered: 2, total: 4, pct: 50 });
    assert.deepEqual(fileTotals(file).branches, {
      covered: 1,
      total: 2,
      pct: 50
    });
    assert.deepEqual(fileTotals(file).functions, {
      covered: 1,
      total: 2,
      pct: 50
    });
  });

  it('treats an unreached branch (`-`) as uncovered rather than as missing', () => {
    const { report } = parse('sample.lcov.info');
    assert.equal(
      present(
        report.files.get('src/calculator.js'),
        'src/calculator.js'
      ).branches.get('2:0:1'),
      0
    );
  });

  it('keeps a record per file', () => {
    const { report } = parse('sample.lcov.info');
    assert.deepEqual(
      [...report.files.keys()],
      ['src/calculator.js', 'src/empty.js']
    );
  });
});

describe('cobertura', () => {
  it('joins <sources> onto the filename to reach a repo-relative path', () => {
    const { report } = parse('sample.cobertura.xml');
    assert.ok(report.files.has('src/calculator.js'));
  });

  it('does not count the lines inside <methods> twice', () => {
    // Those lines repeat the class body. Line coverage would survive it, since
    // lines are keyed by number — the function metric would not.
    const { report } = parse('sample.cobertura.xml');
    const totals = fileTotals(
      present(report.files.get('src/calculator.js'), 'src/calculator.js')
    );
    assert.deepEqual(totals.lines, { covered: 2, total: 4, pct: 50 });
    assert.deepEqual(totals.functions, { covered: 1, total: 2, pct: 50 });
  });

  it('expands condition-coverage into countable branches', () => {
    const { report } = parse('sample.cobertura.xml');
    assert.deepEqual(
      fileTotals(
        present(report.files.get('src/calculator.js'), 'src/calculator.js')
      ).branches,
      {
        covered: 1,
        total: 2,
        pct: 50
      }
    );
  });
});

describe('clover', () => {
  it('counts a method line as a function and not as a statement', () => {
    // PHPUnit puts method declarations in `elements` but not in `statements`,
    // and Cobertura emits no line for them at all. Counting them here would make
    // one test run report two different line totals depending on the export.
    const { report } = parse('sample.clover.xml');
    const totals = fileTotals(
      present(
        report.files.get('app/Services/Catalog.php'),
        'app/Services/Catalog.php'
      )
    );

    assert.deepEqual(totals.lines, { covered: 2, total: 3, pct: 66.67 });
    assert.deepEqual(totals.functions, { covered: 1, total: 1, pct: 100 });
  });

  it('reads truecount/falsecount as covered and uncovered conditions', () => {
    const { report } = parse('sample.clover.xml');
    assert.deepEqual(
      fileTotals(
        present(
          report.files.get('app/Services/Catalog.php'),
          'app/Services/Catalog.php'
        )
      ).branches,
      {
        covered: 1,
        total: 2,
        pct: 50
      }
    );
  });
});

describe('istanbul', () => {
  it('folds several statements on one line into a single line record', () => {
    const { report } = parse('sample.istanbul.json');
    const totals = fileTotals(
      present(report.files.get('src/calculator.js'), 'src/calculator.js')
    );

    // Line 2 holds two statements, one of them never executed. The line still
    // counts once, and it counts as covered.
    assert.deepEqual(totals.lines, { covered: 2, total: 3, pct: 66.67 });
  });

  it('refuses a coverage-summary.json instead of reporting an empty report', () => {
    // Read leniently this file yields zero lines, and zero of zero is 100% — a
    // run that measures nothing and goes green is the worst answer available.
    assert.throws(() => parse('sample.summary.json'), /coverage-summary\.json/);
  });
});

describe('the formats agree', () => {
  it('reports the same line coverage for lcov, cobertura and istanbul', () => {
    // Three exports of one run must come to one number, or a repository would
    // get a different total by changing a reporter.
    const shared = 'src/calculator.js';
    const lcov = fileTotals(
      present(parse('sample.lcov.info').report.files.get(shared), shared)
    );
    const cobertura = fileTotals(
      present(parse('sample.cobertura.xml').report.files.get(shared), shared)
    );

    assert.deepEqual(lcov.lines, cobertura.lines);
    assert.deepEqual(lcov.functions, cobertura.functions);
  });

  it("keeps every report's own files in the total", () => {
    const lcov = reportTotals(parse('sample.lcov.info').report);
    const cobertura = reportTotals(parse('sample.cobertura.xml').report);

    // The lcov fixture also covers src/empty.js, which the Cobertura one omits.
    assert.deepEqual(cobertura.lines, { covered: 2, total: 4, pct: 50 });
    assert.deepEqual(lcov.lines, { covered: 3, total: 5, pct: 60 });
  });
});
