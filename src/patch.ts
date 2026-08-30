import {
  percentage,
  type Report,
  type ReportTotals,
  type Summary
} from './coverage.ts';

export interface FilePatch {
  path: string;
  covered: number;
  total: number;
  pct: number;
  /** Changed lines the suite never executed, ascending. */
  uncovered: number[];
}

export interface PatchCoverage {
  covered: number;
  total: number;
  pct: number;
  files: FilePatch[];
}

export interface MetricDelta {
  pct: number;
  covered: number;
  total: number;
  /** What the base recorded, so a reader can see both ends of the move. */
  before: number;
}

export interface CoverageDelta {
  base: Summary;
  metrics: Partial<Record<'lines' | 'branches' | 'functions', MetricDelta>>;
}

/**
 * Patch coverage: of the lines this pull request added or changed, how many did
 * the suite execute.
 *
 * The distinction that every existing action blurs is here. A changed *file* is
 * not a changed *line*: a one-line fix in a 400-line file is 1 line of patch, and
 * reporting the file's other 399 uncovered lines against the change is how a
 * reviewer learns to ignore the comment. Only lines that are both in the diff and
 * in the report are counted.
 *
 * A changed line the report says nothing about is not counted either way. Blank
 * lines, comments, imports, a `}` — no coverage tool emits a record for them, and
 * inventing one would make every formatting commit look uncovered.
 */
export function patchCoverage(
  report: Report,
  changedLines: Map<string, Set<number>>
): PatchCoverage {
  const files: FilePatch[] = [];
  let covered = 0;
  let total = 0;

  for (const [path, lines] of changedLines) {
    const file = report.files.get(path);
    if (!file) continue;

    const uncovered: number[] = [];
    let fileCovered = 0;
    let fileTotal = 0;

    for (const line of lines) {
      const hits = file.lines.get(line);
      if (hits === undefined) continue;
      fileTotal += 1;
      if (hits > 0) fileCovered += 1;
      else uncovered.push(line);
    }

    if (fileTotal === 0) continue;

    covered += fileCovered;
    total += fileTotal;
    files.push({
      path,
      covered: fileCovered,
      total: fileTotal,
      pct: percentage(fileCovered, fileTotal),
      uncovered: uncovered.sort((a, b) => a - b)
    });
  }

  files.sort(byWorstFirst);

  return { covered, total, pct: percentage(covered, total), files };
}

/**
 * Worst first, because the reason to open the section is to find what needs a
 * test — not to read an alphabetical list of the files that are already fine.
 * Ties break on the number of uncovered lines, then on path for a stable order.
 */
function byWorstFirst(a: FilePatch, b: FilePatch): number {
  if (a.pct !== b.pct) return a.pct - b.pct;
  if (a.uncovered.length !== b.uncovered.length)
    return b.uncovered.length - a.uncovered.length;
  return a.path.localeCompare(b.path);
}

/**
 * The delta against the base state. Returns `null` when there is no base, which
 * is a real and common answer: the first run on a repository, or a pull request
 * whose base branch has never been measured.
 */
export function coverageDelta(
  totals: ReportTotals,
  baseSummary: Summary | null
): CoverageDelta | null {
  if (!baseSummary?.totals) return null;

  const delta: CoverageDelta['metrics'] = {};
  for (const metric of ['lines', 'branches', 'functions'] as const) {
    const now = totals[metric];
    const before = baseSummary.totals[metric];
    if (!before) continue;
    delta[metric] = {
      pct: round(now.pct - before.pct),
      covered: now.covered - before.covered,
      total: now.total - before.total,
      before: before.pct
    };
  }

  return { base: baseSummary, metrics: delta };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
