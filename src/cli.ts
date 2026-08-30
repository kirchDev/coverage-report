import { readFile, writeFile } from 'node:fs/promises';
import { defineCommand, type ArgsDef } from 'citty';
import { mergeReports, toSummary } from './coverage.ts';
import {
  detectFormat,
  FORMATS,
  parseFile,
  type Format
} from './parsers/index.ts';
import { buildReport, type BuildResult } from './pipeline.ts';
import { format as pct, type Thresholds } from './render.ts';

const sharedArgs = {
  report: {
    type: 'string',
    description:
      'Coverage reports to read, comma-separated. Reports may also be given as positional arguments. Several reports merge into one number.',
    alias: 'r'
  },
  root: {
    type: 'string',
    description: 'Repository root the report paths are made relative to.',
    default: process.cwd()
  },
  format: {
    type: 'string',
    description: `Force a format (${FORMATS.join(', ')}) instead of detecting it from the content.`
  }
} satisfies ArgsDef;

const report = defineCommand({
  meta: {
    name: 'report',
    description: 'Render the coverage comment for a pull request.'
  },
  args: {
    ...sharedArgs,
    diff: {
      type: 'string',
      description:
        'Unified diff of the pull request. Without it there is no patch coverage.'
    },
    base: {
      type: 'string',
      description: 'Base-state JSON from the integration branch, for the delta.'
    },
    name: {
      type: 'string',
      description: 'Names this report, for repositories posting more than one.',
      default: ''
    },
    output: {
      type: 'string',
      description: 'Write the markdown here instead of to stdout.',
      alias: 'o'
    },
    json: {
      type: 'boolean',
      description: 'Print the full result as JSON instead of markdown.',
      default: false
    },
    'min-total': {
      type: 'string',
      description: 'Fail below this total line coverage.'
    },
    'min-patch': {
      type: 'string',
      description: 'Fail below this patch coverage.'
    },
    'file-limit': {
      type: 'string',
      description: 'How many files to list in the comment.',
      default: '20'
    },
    commit: {
      type: 'string',
      description: 'Commit SHA, used to link file paths.'
    },
    'repository-url': {
      type: 'string',
      description: 'Repository URL, used to link file paths.'
    }
  },
  async run({ args, rawArgs }) {
    const result = await buildReport({
      reports: reportsFrom(args, rawArgs),
      root: args.root,
      format: toFormat(args.format),
      diff: args.diff,
      base: args.base,
      name: args.name,
      fileLimit: Number(args['file-limit']),
      commit: args.commit,
      repositoryUrl: args['repository-url'],
      thresholds: readThresholds(args)
    });

    const output = args.json
      ? `${JSON.stringify(asJson(result), null, 2)}\n`
      : result.markdown;

    if (args.output) await writeFile(args.output, output);
    else process.stdout.write(output);

    if (result.failures.length > 0) {
      for (const failure of result.failures)
        process.stderr.write(`Coverage threshold not met: ${failure}\n`);
      process.exitCode = 1;
    }
  }
});

const merge = defineCommand({
  meta: {
    name: 'merge',
    description:
      'Merge reports into the base-state JSON this tool reads back on the next run.'
  },
  args: {
    ...sharedArgs,
    output: {
      type: 'string',
      description: 'Where to write the summary.',
      alias: 'o',
      required: true
    },
    sha: { type: 'string', description: 'Commit the summary describes.' },
    ref: { type: 'string', description: 'Ref the summary was measured on.' }
  },
  async run({ args, rawArgs }) {
    const parsed = [];
    for (const path of reportsFrom(args, rawArgs)) {
      parsed.push(
        (
          await parseFile(path, {
            root: args.root,
            format: toFormat(args.format)
          })
        ).report
      );
    }

    const summary = toSummary(mergeReports(parsed), {
      sha: args.sha ?? null,
      ref: args.ref ?? null
    });
    await writeFile(args.output, `${JSON.stringify(summary, null, 2)}\n`);
    process.stdout.write(
      `Wrote ${args.output}: ${pct(summary.totals.lines.pct)} of ${summary.totals.lines.total} lines ` +
        `across ${Object.keys(summary.files).length} files.\n`
    );
  }
});

const detect = defineCommand({
  meta: {
    name: 'detect',
    description:
      'Print which format a report is in — useful when a run reads the wrong file.'
  },
  args: { report: sharedArgs.report },
  async run({ args, rawArgs }) {
    for (const path of reportsFrom(args, rawArgs)) {
      const content = await readFile(path, 'utf8');
      process.stdout.write(`${path}: ${detectFormat(content) ?? 'unknown'}\n`);
    }
  }
});

export const main = defineCommand({
  meta: {
    name: 'coverage-report',
    description: 'Self-hosted coverage reporting for pull requests.'
  },
  subCommands: { report, merge, detect }
});

/**
 * Reports arrive either as `--report a.info,b.xml` or as trailing positionals.
 * Both spellings exist because the Action passes one string and a human at a
 * shell reaches for a glob — `coverage-report report coverage/*.xml` has to work.
 */
function reportsFrom(args: ReportArgs, rawArgs: string[] = []): string[] {
  // A repeated `--report` keeps only the last value, which would silently
  // report on one half of a monorepo and look entirely healthy doing it. Better
  // to refuse than to answer a question nobody asked.
  const repeated = rawArgs.filter(
    (arg) => arg === '--report' || arg === '-r'
  ).length;
  if (repeated > 1) {
    throw new Error(
      'Pass several reports as one comma-separated --report value, or as positional arguments — ' +
        'a repeated --report flag would keep only the last one.'
    );
  }

  const reports = [...toArray(args.report), ...toArray(args._)];
  if (reports.length === 0) {
    throw new Error(
      'No coverage report given. Pass --report <file> or list files as arguments.'
    );
  }
  return reports;
}

/** Only the fields these helpers read, so citty's inferred arg types all fit. */
interface ReportArgs {
  report?: unknown;
  _?: unknown;
}

interface ThresholdArgs {
  'min-total'?: unknown;
  'min-patch'?: unknown;
}

/**
 * Validates `--format` rather than passing the string through. An unknown value
 * would otherwise reach the parser table, miss, and surface as a confusing
 * "unsupported format" far from where it was typed.
 */
function toFormat(value: string | undefined): Format | null {
  if (!value) return null;
  if ((FORMATS as readonly string[]).includes(value)) return value as Format;
  throw new Error(
    `Unknown format "${value}". Expected one of ${FORMATS.join(', ')}.`
  );
}

function toArray(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((entry: unknown) =>
    String(entry)
      .split(/[\n,]/)
      .map((part) => part.trim())
      .filter(Boolean)
  );
}

function readThresholds(args: ThresholdArgs): Thresholds {
  const thresholds: Thresholds = {};
  if (args['min-total'] !== undefined)
    thresholds.total = Number(args['min-total']);
  if (args['min-patch'] !== undefined)
    thresholds.patch = Number(args['min-patch']);
  return thresholds;
}

function asJson(result: BuildResult): Record<string, unknown> {
  return {
    sources: result.sources,
    totals: result.totals,
    patch: result.patch,
    delta: result.delta?.metrics ?? null,
    failures: result.failures,
    markdown: result.markdown
  };
}
