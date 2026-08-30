/**
 * The one shape every parser produces and everything downstream consumes.
 *
 * A report is a map of repo-relative path → file, and a file holds three maps of
 * `key → hit count`. Keying every metric the same way is what makes the merge a
 * single operation rather than three: two reports covering the same file union
 * their keys and sum their hits, and "covered" is then `hits > 0` for lines,
 * branches and functions alike.
 *
 * The keys differ per metric because that is what the formats give us:
 *   - lines     — the line number
 *   - branches  — `line:index`, so two reports of the same file agree
 *   - functions — `line:name`, since a name alone is not unique in a file
 *
 * Summing hits (rather than taking a maximum) matters for a monorepo: a line run
 * by both the unit and the component suite is covered once, and its hit count is
 * the sum of both runs. Only `> 0` is ever read back out, so the sum is never
 * load-bearing on its own.
 */

/** Hit counts keyed by whatever identifies one unit of a metric. */
export type HitMap<Key> = Map<Key, number>;

export interface FileCoverage {
  path: string;
  lines: HitMap<number>;
  branches: HitMap<string>;
  functions: HitMap<string>;
}

export interface Report {
  files: Map<string, FileCoverage>;
}

export interface MetricTotals {
  covered: number;
  total: number;
  pct: number;
}

export interface FileTotals {
  path: string;
  lines: MetricTotals;
  branches: MetricTotals;
  functions: MetricTotals;
}

export interface ReportTotals {
  lines: MetricTotals;
  branches: MetricTotals;
  functions: MetricTotals;
  files: number;
}

/** The compact form written to the base state and read back on the next run. */
export interface Summary {
  schemaVersion: 1;
  generatedAt: string;
  sha: string | null;
  ref: string | null;
  totals: ReportTotals;
  files: Record<
    string,
    {
      lines: [number, number];
      branches: [number, number];
      functions: [number, number];
    }
  >;
}

export function createReport(): Report {
  return { files: new Map() };
}

export function fileOf(report: Report, path: string): FileCoverage {
  let file = report.files.get(path);
  if (!file) {
    file = {
      path,
      lines: new Map(),
      branches: new Map(),
      functions: new Map()
    };
    report.files.set(path, file);
  }
  return file;
}

export function recordHits<Key>(
  map: HitMap<Key>,
  key: Key,
  hits: unknown
): void {
  map.set(key, (map.get(key) ?? 0) + Math.max(0, toCount(hits)));
}

/**
 * Records a key that exists but was never executed. Without this a file with no
 * coverage at all would report `0/0 = 100%`, which is the most dangerous wrong
 * answer this tool could give.
 */
export function recordKey<Key>(map: HitMap<Key>, key: Key): void {
  if (!map.has(key)) map.set(key, 0);
}

export function mergeReports(reports: Report[]): Report {
  const merged = createReport();

  for (const report of reports) {
    for (const [path, file] of report.files) {
      const target = fileOf(merged, path);
      mergeInto(target.lines, file.lines);
      mergeInto(target.branches, file.branches);
      mergeInto(target.functions, file.functions);
    }
  }

  return merged;
}

function mergeInto<Key>(target: HitMap<Key>, source: HitMap<Key>): void {
  for (const [key, hits] of source) {
    recordKey(target, key);
    if (hits > 0) recordHits(target, key, hits);
  }
}

export function metricTotals<Key>(map: HitMap<Key>): MetricTotals {
  let covered = 0;
  for (const hits of map.values()) {
    if (hits > 0) covered += 1;
  }
  return { covered, total: map.size, pct: percentage(covered, map.size) };
}

export function fileTotals(file: FileCoverage): FileTotals {
  return {
    path: file.path,
    lines: metricTotals(file.lines),
    branches: metricTotals(file.branches),
    functions: metricTotals(file.functions)
  };
}

export function reportTotals(report: Report): ReportTotals {
  const totals: ReportTotals = {
    lines: { covered: 0, total: 0, pct: 0 },
    branches: { covered: 0, total: 0, pct: 0 },
    functions: { covered: 0, total: 0, pct: 0 },
    files: report.files.size
  };

  for (const file of report.files.values()) {
    accumulate(totals.lines, metricTotals(file.lines));
    accumulate(totals.branches, metricTotals(file.branches));
    accumulate(totals.functions, metricTotals(file.functions));
  }

  totals.lines.pct = percentage(totals.lines.covered, totals.lines.total);
  totals.branches.pct = percentage(
    totals.branches.covered,
    totals.branches.total
  );
  totals.functions.pct = percentage(
    totals.functions.covered,
    totals.functions.total
  );

  return totals;
}

function accumulate(target: MetricTotals, one: MetricTotals): void {
  target.covered += one.covered;
  target.total += one.total;
}

/**
 * A file with nothing to measure is 100% covered, not 0%. The alternative drags
 * the repository total down every time an empty barrel file is added.
 */
export function percentage(covered: number, total: number): number {
  if (total === 0) return 100;
  return round((covered / total) * 100);
}

export function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function toCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

export function toSummary(
  report: Report,
  { sha = null, ref = null }: { sha?: string | null; ref?: string | null } = {}
): Summary {
  const files: Summary['files'] = {};
  for (const file of report.files.values()) {
    const totals = fileTotals(file);
    files[file.path] = {
      lines: [totals.lines.covered, totals.lines.total],
      branches: [totals.branches.covered, totals.branches.total],
      functions: [totals.functions.covered, totals.functions.total]
    };
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sha,
    ref,
    totals: reportTotals(report),
    files
  };
}
