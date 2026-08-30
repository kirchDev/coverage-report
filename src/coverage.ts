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

export function createReport() {
  return { files: new Map() };
}

export function fileOf(report, path) {
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

export function recordHits(map, key, hits) {
  map.set(key, (map.get(key) ?? 0) + Math.max(0, toCount(hits)));
}

/**
 * Records a key that exists but was never executed. Without this a file with no
 * coverage at all would report `0/0 = 100%`, which is the most dangerous wrong
 * answer this tool could give.
 */
export function recordKey(map, key) {
  if (!map.has(key)) map.set(key, 0);
}

export function mergeReports(reports) {
  const merged = createReport();

  for (const report of reports) {
    for (const [path, file] of report.files) {
      const target = fileOf(merged, path);
      for (const metric of ['lines', 'branches', 'functions']) {
        for (const [key, hits] of file[metric]) {
          recordKey(target[metric], key);
          if (hits > 0) recordHits(target[metric], key, hits);
        }
      }
    }
  }

  return merged;
}

export function metricTotals(map) {
  let covered = 0;
  for (const hits of map.values()) {
    if (hits > 0) covered += 1;
  }
  return { covered, total: map.size, pct: percentage(covered, map.size) };
}

export function fileTotals(file) {
  return {
    path: file.path,
    lines: metricTotals(file.lines),
    branches: metricTotals(file.branches),
    functions: metricTotals(file.functions)
  };
}

export function reportTotals(report) {
  const totals = {
    lines: { covered: 0, total: 0, pct: 0 },
    branches: { covered: 0, total: 0, pct: 0 },
    functions: { covered: 0, total: 0, pct: 0 },
    files: report.files.size
  };

  for (const file of report.files.values()) {
    for (const metric of ['lines', 'branches', 'functions']) {
      const one = metricTotals(file[metric]);
      totals[metric].covered += one.covered;
      totals[metric].total += one.total;
    }
  }

  for (const metric of ['lines', 'branches', 'functions']) {
    totals[metric].pct = percentage(
      totals[metric].covered,
      totals[metric].total
    );
  }

  return totals;
}

/**
 * A file with nothing to measure is 100% covered, not 0%. The alternative drags
 * the repository total down every time an empty barrel file is added.
 */
export function percentage(covered, total) {
  if (total === 0) return 100;
  return round((covered / total) * 100);
}

export function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

/** The compact form written to the base state and read back on the next run. */
export function toSummary(report, { sha = null, ref = null } = {}) {
  const files = {};
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
