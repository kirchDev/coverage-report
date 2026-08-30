import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { readContext, readInputs, run } from '../src/action.js';
import { baseStatePath } from '../src/github/base-state.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

const PULL_REQUEST_ENV = {
  GITHUB_REPOSITORY: 'kirchDev/app',
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_EVENT_PATH: join(FIXTURES, 'pull-request-event.json'),
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_RUN_ID: '99',
  // GitHub uppercases an input name and leaves its hyphens alone.
  'INPUT_GITHUB-TOKEN': 'test-token',
  INPUT_ROOT: '/build/workspace',
  INPUT_REPORTS: [
    join(FIXTURES, 'sample.lcov.info'),
    join(FIXTURES, 'sample.clover.xml')
  ].join('\n')
};

/**
 * A fake GitHub that records what it was asked to do. The point is not to test
 * `fetch` — it is to pin the decisions the Action makes on the way there: which
 * calls happen at all, on which event, and in which order.
 */
function fakeGitHub({
  comments = [],
  baseState = null,
  branchExists = false
} = {}) {
  const calls = [];

  async function fetchImpl(url, options) {
    const path = url.replace('https://api.github.com', '');
    calls.push({
      method: options.method,
      path,
      body: options.body ? JSON.parse(options.body) : null
    });

    if (options.method === 'GET' && path.includes('/pulls/42/files')) {
      return json(
        path.includes('page=1')
          ? [
              {
                filename: 'src/calculator.js',
                status: 'modified',
                patch:
                  '@@ -1,3 +1,4 @@\n const a = 1;\n+const added = 2;\n b();\n c();'
              }
            ]
          : []
      );
    }

    if (options.method === 'GET' && path.includes('/issues/42/comments')) {
      return json(path.includes('page=1') ? comments : []);
    }

    if (options.method === 'GET' && path.includes('/contents/')) {
      if (!baseState) return json({ message: 'Not Found' }, 404);
      return json({
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(baseState)).toString('base64')
      });
    }

    if (options.method === 'GET' && path.includes('/git/ref/heads/')) {
      return branchExists
        ? json({ object: { sha: 'parentsha' } })
        : json({ message: 'Not Found' }, 404);
    }

    if (options.method === 'GET' && path.includes('/git/commits/'))
      return json({ tree: { sha: 'treesha' } });
    if (options.method === 'POST' && path.includes('/git/blobs'))
      return json({ sha: 'blobsha' });
    if (options.method === 'POST' && path.includes('/git/trees'))
      return json({ sha: 'newtreesha' });
    if (options.method === 'POST' && path.includes('/git/commits'))
      return json({ sha: 'commitsha' });
    if (path.includes('/git/refs')) return json({});

    if (options.method === 'POST' && path.endsWith('/comments')) {
      return json({
        id: 1,
        html_url: 'https://github.com/kirchDev/app/pull/42#issuecomment-1'
      });
    }
    if (options.method === 'PATCH' && path.includes('/issues/comments/')) {
      return json({
        id: 7,
        html_url: 'https://github.com/kirchDev/app/pull/42#issuecomment-7'
      });
    }
    if (options.method === 'POST' && path.endsWith('/check-runs'))
      return json({ id: 2 });

    return json({});
  }

  return { fetchImpl, calls };
}

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    text: async () => JSON.stringify(body)
  };
}

function find(calls, method, fragment) {
  return calls.filter(
    (call) => call.method === method && call.path.includes(fragment)
  );
}

describe('inputs', () => {
  it('takes reports one per line or comma-separated', () => {
    const env = { ...PULL_REQUEST_ENV, INPUT_REPORTS: 'a.info,b.xml\nc.json' };
    assert.deepEqual(readInputs(env).reports, ['a.info', 'b.xml', 'c.json']);
  });

  it('refuses to run with no report rather than reporting on nothing', () => {
    assert.throws(
      () => readInputs({ ...PULL_REQUEST_ENV, INPUT_REPORTS: '' }),
      /"reports" input is required/
    );
  });

  it('refuses to run without a token', () => {
    const env = { ...PULL_REQUEST_ENV, 'INPUT_GITHUB-TOKEN': '' };
    assert.throws(() => readInputs(env), /token is required/);
  });

  it('defaults the base branch on, and lets an empty value switch it off', () => {
    // The difference between "not configured" and "configured to nothing".
    assert.equal(readInputs(PULL_REQUEST_ENV).baseBranch, 'coverage');
    assert.equal(
      readInputs({ ...PULL_REQUEST_ENV, 'INPUT_BASE-BRANCH': '' }).baseBranch,
      ''
    );
  });
});

describe('context', () => {
  it('prefers the pull request head SHA over GITHUB_SHA', () => {
    // On a `pull_request` event GITHUB_SHA is the merge commit, which no comment
    // and no check run should ever be attached to.
    const context = readContext({
      ...PULL_REQUEST_ENV,
      GITHUB_SHA: 'mergecommit'
    });
    assert.equal(context.sha, 'headsha0000000000000000000000000000000');
    assert.equal(context.pullNumber, 42);
    assert.equal(context.baseRef, 'dev');
  });

  it('survives an event payload it cannot read', () => {
    const context = readContext({
      ...PULL_REQUEST_ENV,
      GITHUB_EVENT_PATH: '/nope.json',
      GITHUB_SHA: 'abc'
    });
    assert.equal(context.pullNumber, null);
    assert.equal(context.sha, 'abc');
  });
});

describe('the base-state path', () => {
  it('is one file per branch', () => {
    assert.equal(baseStatePath('refs/heads/dev'), 'dev.json');
    assert.equal(baseStatePath('dev'), 'dev.json');
  });

  it('flattens a slashed branch name into a single file name', () => {
    assert.equal(baseStatePath('release/1.x'), 'release-1.x.json');
  });

  it('keeps two named reports on one branch apart', () => {
    assert.equal(baseStatePath('dev', 'php'), 'dev.php.json');
  });
});

describe('a pull-request run', () => {
  it('merges both reports, comments once and writes a check run', async () => {
    const github = fakeGitHub();
    const result = await run(PULL_REQUEST_ENV, { fetchImpl: github.fetchImpl });

    // lcov contributes 3/5, clover 2/3 — one number out of two languages.
    assert.deepEqual(result.totals.lines, { covered: 5, total: 8, pct: 62.5 });
    assert.equal(find(github.calls, 'POST', '/issues/42/comments').length, 1);
    assert.equal(find(github.calls, 'POST', '/check-runs').length, 1);
  });

  it('edits its own previous comment instead of adding another', async () => {
    const github = fakeGitHub({
      comments: [{ id: 7, body: '<!-- coverage-report -->\nold body' }]
    });
    await run(PULL_REQUEST_ENV, { fetchImpl: github.fetchImpl });

    assert.equal(find(github.calls, 'PATCH', '/issues/comments/7').length, 1);
    assert.equal(find(github.calls, 'POST', '/issues/42/comments').length, 0);
  });

  it('leaves a comment carrying somebody else marker alone', async () => {
    const github = fakeGitHub({
      comments: [{ id: 9, body: 'looks fine to me' }]
    });
    await run(PULL_REQUEST_ENV, { fetchImpl: github.fetchImpl });

    assert.equal(find(github.calls, 'PATCH', '/issues/comments/').length, 0);
    assert.equal(find(github.calls, 'POST', '/issues/42/comments').length, 1);
  });

  it('computes patch coverage from the pull request diff', async () => {
    const github = fakeGitHub();
    const result = await run(PULL_REQUEST_ENV, { fetchImpl: github.fetchImpl });

    // The diff adds line 2 of src/calculator.js, which lcov records as covered.
    assert.deepEqual([result.patch.covered, result.patch.total], [1, 1]);
  });

  it('does not record a base state from a pull request', async () => {
    // Recording one here would make every branch its own baseline, and every
    // delta zero.
    const github = fakeGitHub();
    await run(PULL_REQUEST_ENV, { fetchImpl: github.fetchImpl });

    assert.equal(find(github.calls, 'POST', '/git/commits').length, 0);
  });

  it('reads the base state for the branch the pull request targets', async () => {
    const github = fakeGitHub();
    await run(PULL_REQUEST_ENV, { fetchImpl: github.fetchImpl });

    assert.equal(find(github.calls, 'GET', '/contents/dev.json').length, 1);
  });

  it('renders a delta once a base state exists', async () => {
    const github = fakeGitHub({
      baseState: {
        schemaVersion: 1,
        sha: 'oldsha1',
        totals: { lines: { covered: 4, total: 8, pct: 50 } }
      }
    });
    const result = await run(PULL_REQUEST_ENV, { fetchImpl: github.fetchImpl });

    assert.equal(result.delta.metrics.lines.pct, 12.5);
    assert.match(result.markdown, /▲ \+12\.50%/);
  });

  it('carries on without a delta when the branch has never been measured', async () => {
    const github = fakeGitHub({ baseState: null });
    const result = await run(PULL_REQUEST_ENV, { fetchImpl: github.fetchImpl });

    assert.equal(result.delta, null);
    assert.equal(find(github.calls, 'POST', '/check-runs').length, 1);
  });

  it('fails the check run when a threshold is missed', async () => {
    const github = fakeGitHub();
    const result = await run(
      {
        ...PULL_REQUEST_ENV,
        'INPUT_MIN-TOTAL': '90',
        'INPUT_FAIL-ON-THRESHOLD': 'false'
      },
      { fetchImpl: github.fetchImpl }
    );

    assert.equal(result.failures.length, 1);
    assert.equal(
      find(github.calls, 'POST', '/check-runs')[0].body.conclusion,
      'failure'
    );
  });

  it('concludes neutral, never success, when no threshold was configured', async () => {
    // A green tick that means "nobody asked for anything" reads as a passing
    // quality gate to every human who sees it, and there is no gate.
    const github = fakeGitHub();
    await run(PULL_REQUEST_ENV, { fetchImpl: github.fetchImpl });

    assert.equal(
      find(github.calls, 'POST', '/check-runs')[0].body.conclusion,
      'neutral'
    );
  });

  it('concludes success when a configured threshold was met', async () => {
    const github = fakeGitHub();
    await run(
      { ...PULL_REQUEST_ENV, 'INPUT_MIN-TOTAL': '10' },
      { fetchImpl: github.fetchImpl }
    );

    assert.equal(
      find(github.calls, 'POST', '/check-runs')[0].body.conclusion,
      'success'
    );
  });

  it('skips the comment when it is switched off', async () => {
    const github = fakeGitHub();
    await run(
      { ...PULL_REQUEST_ENV, INPUT_COMMENT: 'false' },
      { fetchImpl: github.fetchImpl }
    );

    assert.equal(find(github.calls, 'POST', '/issues/42/comments').length, 0);
    assert.equal(find(github.calls, 'POST', '/check-runs').length, 1);
  });
});

describe('a push run', () => {
  const pushEnv = {
    ...PULL_REQUEST_ENV,
    GITHUB_EVENT_NAME: 'push',
    GITHUB_EVENT_PATH: '/does-not-exist.json',
    GITHUB_REF: 'refs/heads/dev',
    GITHUB_SHA: 'pushsha1234567'
  };

  it('records the base state on the branch that was pushed', async () => {
    const github = fakeGitHub();
    await run(pushEnv, { fetchImpl: github.fetchImpl });

    const blob = find(github.calls, 'POST', '/git/blobs')[0];
    assert.match(blob.body.content, /"schemaVersion": 1/);
    assert.equal(find(github.calls, 'POST', '/git/refs').length, 1);
  });

  it('creates the orphan branch with a parentless commit the first time', async () => {
    const github = fakeGitHub({ branchExists: false });
    await run(pushEnv, { fetchImpl: github.fetchImpl });

    assert.deepEqual(
      find(github.calls, 'POST', '/git/commits')[0].body.parents,
      []
    );
  });

  it('adds to the existing branch rather than replacing its tree', async () => {
    // Without a base_tree the commit holds one file and nothing else, which
    // would drop every other branch's recorded state.
    const github = fakeGitHub({ branchExists: true });
    await run(pushEnv, { fetchImpl: github.fetchImpl });

    assert.equal(
      find(github.calls, 'POST', '/git/trees')[0].body.base_tree,
      'treesha'
    );
    assert.deepEqual(
      find(github.calls, 'POST', '/git/commits')[0].body.parents,
      ['parentsha']
    );
  });

  it('posts no comment when there is no pull request to comment on', async () => {
    const github = fakeGitHub();
    await run(pushEnv, { fetchImpl: github.fetchImpl });

    assert.equal(find(github.calls, 'POST', '/comments').length, 0);
  });

  it('never records a base state when the base branch is switched off', async () => {
    const github = fakeGitHub();
    await run(
      { ...pushEnv, 'INPUT_BASE-BRANCH': '' },
      { fetchImpl: github.fetchImpl }
    );

    assert.equal(find(github.calls, 'POST', '/git/blobs').length, 0);
  });
});
