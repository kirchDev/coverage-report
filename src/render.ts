import type { ReportTotals, Summary } from './coverage.ts';
import { formatLineRanges } from './diff.ts';
import type {
  CoverageDelta,
  FilePatch,
  MetricDelta,
  PatchCoverage
} from './patch.ts';

/** Percentages a run may be held to. Absent means "nobody asked". */
export interface Thresholds {
  total?: number;
  patch?: number;
}

export interface RenderOptions {
  totals: ReportTotals;
  patch?: PatchCoverage | null;
  delta?: CoverageDelta | null;
  name?: string;
  thresholds?: Thresholds;
  fileLimit?: number;
  commit?: string | null;
  repositoryUrl?: string | null;
}

/**
 * The comment body.
 *
 * One marker line at the top is what makes the comment sticky: the action finds
 * its own previous comment by this string and edits it, so a pull request with
 * thirty pushes carries one comment rather than thirty. The `name` is part of the
 * marker so a repository can post two independent reports (say, one per package)
 * without them overwriting each other.
 */
export function marker(name = ''): string {
  return `<!-- coverage-report${name ? `:${name}` : ''} -->`;
}

export function renderMarkdown({
  totals,
  patch = null,
  delta = null,
  name = '',
  thresholds = {},
  fileLimit = 20,
  commit = null,
  repositoryUrl = null
}: RenderOptions): string {
  const lines = [marker(name)];

  lines.push(
    '',
    `## ${icon(totals.lines.pct, thresholds.total)} Coverage${name ? ` — ${name}` : ''}`,
    ''
  );
  lines.push(totalsTable(totals, delta, thresholds));

  if (patch) {
    lines.push('', patchSection(patch, thresholds));
    if (patch.files.length > 0) {
      lines.push('', fileSection(patch, fileLimit, commit, repositoryUrl));
    }
  }

  if (delta?.base) {
    lines.push('', baseLine(delta.base));
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * The same numbers for a terminal.
 *
 * The comment body is Markdown for GitHub, so a local run prints `<details>`
 * and pipe tables at a shell that renders neither. This is the same report as
 * aligned columns — the CLI's own output, not a preview of somebody else's.
 */
export function renderText({
  totals,
  patch = null,
  delta = null,
  name = '',
  fileLimit = 20
}: RenderOptions): string {
  const lines: string[] = [];
  if (name) lines.push(name, '');

  const metrics = (['lines', 'branches', 'functions'] as const)
    .filter((metric) => totals[metric].total > 0)
    .map((metric) => [
      `${format(totals[metric].pct)}`,
      `${totals[metric].covered}/${totals[metric].total} ${metric}`,
      delta?.metrics?.[metric] ? renderDelta(delta.metrics[metric]) : ''
    ]);

  lines.push(...column('Coverage', metrics));

  if (patch) {
    lines.push('', ...column('Patch', patchRows(patch)));

    const files = patch.files.filter((file) => file.uncovered.length > 0);
    if (files.length > 0) {
      lines.push('', ...fileRows(files, fileLimit));
    }
  }

  if (delta?.base) {
    const at = delta.base.sha ? delta.base.sha.slice(0, 7) : 'the base state';
    const ref = delta.base.ref ? ` on ${delta.base.ref}` : '';
    lines.push('', `Compared against ${at}${ref}.`);
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function patchRows(patch: PatchCoverage): string[][] {
  if (patch.total === 0) {
    return [['—', 'no changed line carries coverage data', '']];
  }

  const uncovered = patch.total - patch.covered;
  return [
    [
      format(patch.pct),
      `${patch.covered}/${patch.total} changed lines`,
      uncovered === 0 ? 'all covered' : `${uncovered} uncovered`
    ]
  ];
}

function fileRows(files: FilePatch[], fileLimit: number): string[] {
  const shown = files.slice(0, fileLimit);
  const width = Math.max(...shown.map((file) => file.path.length));
  const rows = shown.map(
    (file) =>
      `  ${file.path.padEnd(width)}  ${format(file.pct).padStart(7)}  ` +
      formatLineRanges(file.uncovered, { limit: 8 })
  );

  const hidden = files.length - shown.length;
  if (hidden > 0)
    rows.push(`  … and ${hidden} more ${hidden === 1 ? 'file' : 'files'}`);

  return rows;
}

/**
 * Pads every column to its widest cell so the percentages line up, and repeats
 * the label only on the first row — the rows under "Coverage" are the same
 * measurement from three angles, not three separate headings.
 */
function column(label: string, rows: string[][]): string[] {
  const labelWidth = Math.max(label.length + 2, 10);
  const widths = rows.reduce<number[]>(
    (widest, row) =>
      row.map((cell, index) => Math.max(widest[index] ?? 0, cell.length)),
    []
  );

  return rows.map((row, index) =>
    `${(index === 0 ? label : '').padEnd(labelWidth)}${row
      .map((cell, cellIndex) =>
        cellIndex === 0
          ? cell.padStart(widths[0] ?? 0)
          : cell.padEnd(widths[cellIndex] ?? 0)
      )
      .join('  ')}`.trimEnd()
  );
}

function totalsTable(
  totals: ReportTotals,
  delta: CoverageDelta | null,
  thresholds: Thresholds
): string {
  const rows = [
    '| | Coverage | Covered / Total | Change |',
    '| :--- | ---: | ---: | ---: |'
  ];

  for (const metric of ['lines', 'branches', 'functions'] as const) {
    const value = totals[metric];
    if (value.total === 0) continue;
    const threshold = metric === 'lines' ? thresholds.total : undefined;
    rows.push(
      `| ${icon(value.pct, threshold)} ${label(metric)} | ${format(value.pct)} | ` +
        `${value.covered} / ${value.total} | ${renderDelta(delta?.metrics?.[metric])} |`
    );
  }

  return rows.join('\n');
}

function patchSection(patch: PatchCoverage, thresholds: Thresholds): string {
  if (patch.total === 0) {
    return '> [!NOTE]\n> No changed line in this pull request carries coverage data — nothing measurable changed.';
  }

  const uncovered = patch.total - patch.covered;
  const summary =
    `${icon(patch.pct, thresholds.patch)} **Patch coverage: ${format(patch.pct)}** ` +
    `(${patch.covered} / ${patch.total} changed lines)`;

  if (uncovered === 0) {
    return `${summary} — every changed line is covered.`;
  }

  return `${summary} — ${uncovered} changed ${uncovered === 1 ? 'line is' : 'lines are'} not covered.`;
}

function fileSection(
  patch: PatchCoverage,
  fileLimit: number,
  commit: string | null,
  repositoryUrl: string | null
): string {
  const shown = patch.files
    .filter((file) => file.uncovered.length > 0)
    .slice(0, fileLimit);
  if (shown.length === 0) return '';

  const rows = [
    '| File | Patch | Uncovered changed lines |',
    '| :--- | ---: | :--- |'
  ];

  for (const file of shown) {
    rows.push(
      `| ${link(file.path, commit, repositoryUrl)} | ${format(file.pct)} | ` +
        `${formatLineRanges(file.uncovered, { limit: 8 })} |`
    );
  }

  const hidden =
    patch.files.filter((file) => file.uncovered.length > 0).length -
    shown.length;
  if (hidden > 0)
    rows.push(
      `| … and ${hidden} more ${hidden === 1 ? 'file' : 'files'} | | |`
    );

  return [
    '<details>',
    `<summary>Files with uncovered changed lines (${shown.length + Math.max(0, hidden)})</summary>`,
    '',
    rows.join('\n'),
    '',
    '</details>'
  ].join('\n');
}

function baseLine(base: Summary): string {
  const at = base.sha ? `\`${base.sha.slice(0, 7)}\`` : 'the base state';
  const ref = base.ref ? ` on \`${base.ref}\`` : '';
  return `<sub>Compared against ${at}${ref}.</sub>`;
}

function link(
  path: string,
  commit: string | null,
  repositoryUrl: string | null
): string {
  if (!commit || !repositoryUrl) return `\`${path}\``;
  return `[\`${path}\`](${repositoryUrl}/blob/${commit}/${path})`;
}

function renderDelta(metric: MetricDelta | undefined): string {
  if (!metric) return '–';
  if (metric.pct === 0) return '±0.00%';
  const arrow = metric.pct > 0 ? '▲' : '▼';
  return `${arrow} ${metric.pct > 0 ? '+' : ''}${format(metric.pct)}`;
}

function label(metric: string): string {
  return metric.charAt(0).toUpperCase() + metric.slice(1);
}

export function format(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

/**
 * Green when it clears the threshold the repository set, red when it does not,
 * and a neutral marker when no threshold was configured — a red circle next to a
 * number nobody promised to hit is noise that trains reviewers to ignore the
 * comment.
 */
function icon(pct: number, threshold?: number): string {
  if (threshold === undefined) return '⚪';
  return pct >= threshold ? '🟢' : '🔴';
}

/**
 * The check-run summary. Shorter than the comment on purpose: a check run's
 * output is read in a list next to twenty other checks, so it answers "did this
 * pass and by how much" and links out for the rest.
 */
export function renderCheckSummary({
  totals,
  patch
}: {
  totals: ReportTotals;
  patch?: PatchCoverage | null;
}): string {
  const parts = [
    `Lines ${format(totals.lines.pct)} (${totals.lines.covered}/${totals.lines.total})`
  ];
  if (patch && patch.total > 0) {
    parts.push(`patch ${format(patch.pct)} (${patch.covered}/${patch.total})`);
  }
  // The failures are appended by the check run itself, as a list under this
  // line. Repeating them here printed each one twice.
  return parts.join(' · ');
}

export function thresholdFailures({
  totals,
  patch,
  thresholds = {}
}: {
  totals: ReportTotals;
  patch?: PatchCoverage | null;
  thresholds?: Thresholds;
}): string[] {
  const failures: string[] = [];
  if (thresholds.total !== undefined && totals.lines.pct < thresholds.total) {
    failures.push(
      `total ${format(totals.lines.pct)} is below the required ${format(thresholds.total)}`
    );
  }
  if (
    thresholds.patch !== undefined &&
    patch &&
    patch.total > 0 &&
    patch.pct < thresholds.patch
  ) {
    failures.push(
      `patch ${format(patch.pct)} is below the required ${format(thresholds.patch)}`
    );
  }
  return failures;
}
