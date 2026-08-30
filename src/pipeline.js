import { readFile } from 'node:fs/promises';
import { mergeReports, reportTotals, toSummary } from './coverage.js';
import { parseUnifiedDiff } from './diff.js';
import { parseFile } from './parsers/index.js';
import { coverageDelta, patchCoverage } from './patch.js';
import { renderMarkdown, thresholdFailures } from './render.js';

/**
 * The whole job in one function, so the CLI and the Action cannot drift into
 * computing different numbers from the same inputs. Everything either of them
 * does beyond this is input gathering and output delivery.
 */
export async function buildReport({
  reports,
  root = process.cwd(),
  format = null,
  diff = null,
  base = null,
  name = '',
  thresholds = {},
  fileLimit = 20,
  commit = null,
  repositoryUrl = null
}) {
  if (!reports || reports.length === 0) {
    throw new Error('At least one coverage report is required.');
  }

  const parsed = [];
  for (const path of reports) {
    parsed.push(await parseFile(path, { root, format }));
  }

  const merged = mergeReports(parsed.map((entry) => entry.report));
  const totals = reportTotals(merged);

  const changed = diff ? parseUnifiedDiff(await readFile(diff, 'utf8')) : null;
  const patch = changed ? patchCoverage(merged, changed) : null;

  const baseSummary = base ? JSON.parse(await readFile(base, 'utf8')) : null;
  const delta = coverageDelta(totals, baseSummary);

  const failures = thresholdFailures({ totals, patch, thresholds });

  return {
    report: merged,
    sources: parsed.map((entry, index) => ({
      path: reports[index],
      format: entry.format
    })),
    totals,
    patch,
    delta,
    failures,
    summary: toSummary(merged, { sha: commit }),
    markdown: renderMarkdown({
      totals,
      patch,
      delta,
      name,
      thresholds,
      fileLimit,
      commit,
      repositoryUrl
    })
  };
}
