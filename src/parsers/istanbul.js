import { createReport, fileOf, recordHits, recordKey } from '../coverage.js';
import { normalisePath } from '../paths.js';

/**
 * Istanbul's `coverage-final.json` — what Vitest and Jest write with the `json`
 * reporter, and the only format of the four that carries source positions rather
 * than pre-aggregated line counts.
 *
 *   { "/abs/file.ts": {
 *       statementMap: { "0": { start: { line, column }, end: … } }, s: { "0": 3 },
 *       fnMap:        { "0": { name, decl: { start: { line } } } },  f: { "0": 1 },
 *       branchMap:    { "0": { loc, locations: [ … ] } },            b: { "0": [1, 0] } } }
 *
 * A line holds several statements often enough that it matters: `a && b()` on
 * one line is two. Recording each statement against its starting line and
 * summing means the line counts as covered when any statement on it ran, which
 * is what every other format already reports.
 *
 * The sibling `coverage-summary.json` is refused rather than read. It holds
 * per-file totals only — no line numbers — so it can answer neither "which lines
 * did this pull request leave uncovered" nor "what do these two reports come to
 * together". Parsing it leniently would produce a report with zero lines in it,
 * and a file with nothing to measure counts as fully covered: the run would go
 * green at 100% while measuring nothing at all. The one loud failure is the
 * whole point.
 */
export class SummaryReportError extends Error {
  constructor() {
    super(
      'This is an Istanbul coverage-summary.json, which carries totals but no line numbers. ' +
        'Use coverage-final.json (reporter "json"), or lcov.info, instead.'
    );
    this.name = 'SummaryReportError';
  }
}

export function parseIstanbul(json, options = {}) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (isSummary(data)) throw new SummaryReportError();

  const report = createReport();

  for (const [key, entry] of Object.entries(data)) {
    if (!entry || typeof entry !== 'object') continue;
    if (key === 'total') continue;

    const file = fileOf(report, normalisePath(entry.path ?? key, options));

    for (const [id, statement] of Object.entries(entry.statementMap ?? {})) {
      const line = statement?.start?.line;
      if (!Number.isFinite(line)) continue;
      recordKey(file.lines, line);
      recordHits(file.lines, line, entry.s?.[id] ?? 0);
    }

    for (const [id, fn] of Object.entries(entry.fnMap ?? {})) {
      const line = fn?.decl?.start?.line ?? fn?.loc?.start?.line;
      const mapKey = `${Number.isFinite(line) ? line : '?'}:${fn?.name ?? id}`;
      recordKey(file.functions, mapKey);
      recordHits(file.functions, mapKey, entry.f?.[id] ?? 0);
    }

    for (const [id, branch] of Object.entries(entry.branchMap ?? {})) {
      const counts = entry.b?.[id] ?? [];
      const line = branch?.loc?.start?.line ?? branch?.line;
      const outcomes = Math.max(counts.length, branch?.locations?.length ?? 0);
      for (let index = 0; index < outcomes; index += 1) {
        const mapKey = `${Number.isFinite(line) ? line : id}:${index}`;
        recordKey(file.branches, mapKey);
        recordHits(file.branches, mapKey, counts[index] ?? 0);
      }
    }
  }

  return report;
}

function isSummary(data) {
  for (const [key, entry] of Object.entries(data)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.statementMap || entry.fnMap || entry.branchMap) return false;
    // `total` plus per-file entries carrying `{ lines: { pct } }` and no maps is
    // the shape of coverage-summary.json and of nothing else.
    if (key === 'total' || typeof entry.lines?.pct === 'number') return true;
  }
  return false;
}
