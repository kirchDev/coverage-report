import { readFile } from 'node:fs/promises';
import {
  mergeReports,
  reportTotals,
  toSummary,
  type Report,
  type ReportTotals,
  type Summary
} from './coverage.ts';
import { parseUnifiedDiff } from './diff.ts';
import { parseFile, type Format, type ParseResult } from './parsers/index.ts';
import {
  coverageDelta,
  patchCoverage,
  type CoverageDelta,
  type PatchCoverage
} from './patch.ts';
import {
  renderMarkdown,
  thresholdFailures,
  type Thresholds
} from './render.ts';

export interface BuildOptions {
  reports: string[];
  root?: string;
  format?: Format | null;
  /** Path to a unified diff. Without one there is no patch coverage. */
  diff?: string | null;
  /** Path to the base-state JSON. Without one there is no delta. */
  base?: string | null;
  name?: string;
  thresholds?: Thresholds;
  fileLimit?: number;
  commit?: string | null;
  repositoryUrl?: string | null;
}

export interface BuildResult {
  report: Report;
  sources: { path: string; format: Format }[];
  totals: ReportTotals;
  patch: PatchCoverage | null;
  delta: CoverageDelta | null;
  failures: string[];
  summary: Summary;
  markdown: string;
}

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
}: BuildOptions): Promise<BuildResult> {
  if (!reports || reports.length === 0) {
    throw new Error('At least one coverage report is required.');
  }

  const parsed: ParseResult[] = [];
  for (const path of reports) {
    parsed.push(await parseFile(path, { root, format }));
  }

  const merged = mergeReports(parsed.map((entry) => entry.report));
  const totals = reportTotals(merged);

  const changed = diff ? parseUnifiedDiff(await readFile(diff, 'utf8')) : null;
  const patch = changed ? patchCoverage(merged, changed) : null;

  const baseSummary: Summary | null = base
    ? (JSON.parse(await readFile(base, 'utf8')) as Summary)
    : null;
  const delta = coverageDelta(totals, baseSummary);

  const failures = thresholdFailures({ totals, patch, thresholds });

  return {
    report: merged,
    sources: parsed.map((entry, index) => ({
      path: reports[index] as string,
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
