import { readFileSync } from 'node:fs';
import {
  mergeReports,
  reportTotals,
  toSummary,
  type Summary
} from './coverage.ts';
import { parsePatchHunks } from './diff.ts';
import {
  createClient,
  type FetchLike,
  type GitHubClient
} from './github/api.ts';
import {
  baseStatePath,
  readBaseState,
  writeBaseState
} from './github/base-state.ts';
import { writeCheckRun } from './github/check.ts';
import { upsertComment } from './github/comment.ts';
import { parseFile, type Format } from './parsers/index.ts';
import {
  coverageDelta,
  patchCoverage,
  type CoverageDelta,
  type PatchCoverage
} from './patch.ts';
import {
  renderCheckSummary,
  renderMarkdown,
  thresholdFailures,
  type Thresholds
} from './render.ts';
import { core } from './workflow.ts';

/** The subset of the environment this action reads. */
export type ActionEnv = Record<string, string | undefined>;

export interface ActionInputs {
  reports: string[];
  token: string;
  format: Format | null;
  root: string;
  name: string;
  comment: boolean;
  checkRun: boolean;
  checkName: string;
  baseBranch: string;
  updateBase: string;
  failOnThreshold: boolean;
  fileLimit: number;
  thresholds: Thresholds;
}

export interface ActionContext {
  owner: string;
  repo: string;
  eventName: string;
  sha: string;
  ref: string;
  baseRef: string | null;
  pullNumber: number | null;
  repositoryUrl: string | null;
  runUrl: string | null;
}

/** Only the parts of a webhook payload this action looks at. */
interface EventPayload {
  pull_request?: {
    number?: number;
    head?: { sha?: string };
    base?: { ref?: string };
  };
  issue?: { number?: number };
}

interface PullRequestFile {
  filename: string;
  status: string;
  patch?: string;
}

/**
 * The Action: input gathering, then delivery. Every number it reports comes from
 * the same modules the CLI drives, so `coverage-report report` run locally and
 * the comment on the pull request cannot disagree.
 */
export async function run(
  env: ActionEnv = process.env,
  { fetchImpl }: { fetchImpl?: FetchLike } = {}
): Promise<{
  totals: ReturnType<typeof reportTotals>;
  patch: PatchCoverage | null;
  delta: CoverageDelta | null;
  failures: string[];
  markdown: string;
}> {
  const input = readInputs(env);
  const context = readContext(env);

  const parsed = [];
  for (const path of input.reports) {
    const entry = await parseFile(path, {
      root: input.root,
      format: input.format
    });
    core.info(`Read ${path} as ${entry.format}.`);
    parsed.push(entry.report);
  }

  const report = mergeReports(parsed);
  const totals = reportTotals(report);
  const summary = toSummary(report, {
    sha: context.sha,
    ref: context.baseRef ?? context.ref
  });

  const client = createClient({ token: input.token, fetchImpl });

  const changed = context.pullNumber
    ? await changedLines(client, { ...context, pullNumber: context.pullNumber })
    : null;
  const patch = changed ? patchCoverage(report, changed) : null;

  const base = await loadBaseState(client, { input, context });
  const delta = coverageDelta(totals, base);

  const failures = thresholdFailures({
    totals,
    patch,
    thresholds: input.thresholds
  });
  const gated =
    input.thresholds.total !== undefined ||
    input.thresholds.patch !== undefined;

  const markdown = renderMarkdown({
    totals,
    patch,
    delta,
    name: input.name,
    thresholds: input.thresholds,
    fileLimit: input.fileLimit,
    commit: context.sha,
    repositoryUrl: context.repositoryUrl
  });

  if (input.comment && context.pullNumber) {
    const result = await upsertComment(client, {
      owner: context.owner,
      repo: context.repo,
      issueNumber: context.pullNumber,
      body: markdown,
      name: input.name
    });
    core.info(`Comment ${result.action}: ${result.url}`);
    core.setOutput('comment-url', safeUrl(result.url));
  } else if (input.comment) {
    core.info('No pull request in context — skipping the comment.');
  }

  if (input.checkRun) {
    await writeCheckRun(client, {
      owner: context.owner,
      repo: context.repo,
      sha: context.sha,
      name: input.checkName,
      title: `Lines ${totals.lines.pct.toFixed(2)}%`,
      summary: renderCheckSummary({ totals, patch }),
      failures,
      gated,
      detailsUrl: context.runUrl
    });
    core.info(`Wrote check run "${input.checkName}".`);
  }

  if (shouldUpdateBase(input, context)) {
    const written = await writeBaseState(client, {
      owner: context.owner,
      repo: context.repo,
      branch: input.baseBranch,
      path: baseStatePath(context.ref, input.name),
      summary,
      message: `chore(coverage): record ${context.ref} at ${String(context.sha).slice(0, 7)}`
    });
    core.info(
      `Recorded base state at ${written.branch}:${written.path} (${written.commit.slice(0, 7)}).`
    );
  }

  core.summary(markdown);
  core.setOutput('lines-pct', String(totals.lines.pct));
  core.setOutput('patch-pct', patch ? String(patch.pct) : '');
  core.setOutput(
    'delta-pct',
    delta?.metrics?.lines ? String(delta.metrics.lines.pct) : ''
  );
  core.setOutput('failed', String(failures.length > 0));

  if (failures.length > 0) {
    for (const failure of failures)
      core.error(`Coverage threshold not met: ${failure}`);
    if (input.failOnThreshold) core.fail(failures.join('; '));
  }

  return { totals, patch, delta, failures, markdown };
}

/**
 * GITHUB_OUTPUT is a file the runner parses as a command language, so nothing
 * shaped by a response goes into it unchecked. A comment URL is generated by
 * GitHub and has exactly one shape; anything else is dropped rather than
 * written.
 */
function safeUrl(value: unknown): string {
  return typeof value === 'string' &&
    /^https:\/\/[\w.-]+\/[\w./#-]*$/.test(value)
    ? value
    : '';
}

async function changedLines(
  client: GitHubClient,
  {
    owner,
    repo,
    pullNumber
  }: { owner: string; repo: string; pullNumber: number }
): Promise<Map<string, Set<number>>> {
  const changed = new Map<string, Set<number>>();

  for (let page = 1; page <= 30; page += 1) {
    const files = await client.get(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`
    );
    if (!Array.isArray(files) || files.length === 0) break;

    for (const file of files as PullRequestFile[]) {
      if (file.status === 'removed') continue;
      const lines = parsePatchHunks(file.patch);
      if (lines.size > 0) changed.set(file.filename, lines);
    }

    if (files.length < 100) break;
  }

  return changed;
}

async function loadBaseState(
  client: GitHubClient,
  { input, context }: { input: ActionInputs; context: ActionContext }
): Promise<Summary | null> {
  if (!input.baseBranch) return null;

  const ref = context.baseRef ?? context.ref;
  const state = await readBaseState(client, {
    owner: context.owner,
    repo: context.repo,
    branch: input.baseBranch,
    path: baseStatePath(ref, input.name)
  });

  if (!state)
    core.info(
      `No base state for "${ref}" yet — the delta is skipped on this run.`
    );
  return state;
}

/**
 * The base state is written from the integration branch, never from a pull
 * request: a PR's own number is what we are comparing *against* the base, and
 * recording it would make every branch its own baseline and every delta zero.
 */
function shouldUpdateBase(
  input: ActionInputs,
  context: ActionContext
): boolean {
  if (input.updateBase === 'false') return false;
  if (!input.baseBranch) return false;
  if (input.updateBase === 'true') return true;
  return context.eventName === 'push' && !context.pullNumber;
}

export function readInputs(env: ActionEnv): ActionInputs {
  const reports = list(input(env, 'reports'));
  if (reports.length === 0) throw new Error('The "reports" input is required.');

  const token = input(env, 'github-token') || env.GITHUB_TOKEN;
  if (!token)
    throw new Error(
      'A token is required: pass "github-token" or set GITHUB_TOKEN.'
    );

  return {
    reports,
    token,
    format: (input(env, 'format') || null) as Format | null,
    root: input(env, 'root') || env.GITHUB_WORKSPACE || process.cwd(),
    name: input(env, 'name') || '',
    comment: boolean(input(env, 'comment'), true),
    checkRun: boolean(input(env, 'check-run'), true),
    checkName: input(env, 'check-name') || 'Coverage',
    baseBranch:
      raw(env, 'base-branch') === undefined
        ? 'coverage'
        : input(env, 'base-branch'),
    updateBase: (input(env, 'update-base') || 'auto').toLowerCase(),
    failOnThreshold: boolean(input(env, 'fail-on-threshold'), true),
    fileLimit: Number(input(env, 'file-limit') || 20),
    thresholds: {
      ...optionalNumber('total', input(env, 'min-total')),
      ...optionalNumber('patch', input(env, 'min-patch'))
    }
  };
}

export function readContext(env: ActionEnv): ActionContext {
  const [owner = '', repo = ''] = String(env.GITHUB_REPOSITORY ?? '').split(
    '/'
  );
  const event = readEvent(env);
  const pullNumber =
    event?.pull_request?.number ?? event?.issue?.number ?? null;
  const server = env.GITHUB_SERVER_URL ?? 'https://github.com';

  return {
    owner,
    repo,
    eventName: env.GITHUB_EVENT_NAME ?? '',
    sha: event?.pull_request?.head?.sha ?? env.GITHUB_SHA ?? '',
    ref:
      (env.GITHUB_REF ?? '').replace(/^refs\/heads\//, '') ||
      env.GITHUB_REF_NAME ||
      '',
    baseRef: event?.pull_request?.base?.ref ?? env.GITHUB_BASE_REF ?? null,
    pullNumber,
    repositoryUrl: owner && repo ? `${server}/${owner}/${repo}` : null,
    runUrl:
      owner && repo && env.GITHUB_RUN_ID
        ? `${server}/${owner}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`
        : null
  };
}

function readEvent(env: ActionEnv): EventPayload | null {
  if (!env.GITHUB_EVENT_PATH) return null;
  try {
    return JSON.parse(
      readFileSync(env.GITHUB_EVENT_PATH, 'utf8')
    ) as EventPayload;
  } catch {
    // A workflow can be triggered by an event this action does not need, and a
    // missing or unreadable payload only costs the pull-request half of the run
    // — never the coverage number itself.
    return null;
  }
}

function input(env: ActionEnv, key: string): string {
  return (raw(env, key) ?? '').trim();
}

/** Distinguishes "not configured" from "configured to nothing", which is how
 *  `base-branch: ''` switches the base state off rather than defaulting it on. */
function raw(env: ActionEnv, key: string): string | undefined {
  return env[`INPUT_${key.toUpperCase()}`];
}

function list(value: string): string[] {
  return String(value)
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function boolean(value: string, fallback: boolean): boolean {
  if (value === '') return fallback;
  return value.toLowerCase() === 'true';
}

function optionalNumber(
  key: 'total' | 'patch',
  value: string
): Partial<Thresholds> {
  if (value === '') return {};
  const parsed = Number(value);
  return Number.isFinite(parsed) ? { [key]: parsed } : {};
}
