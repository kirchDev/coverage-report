/**
 * Where the base number lives.
 *
 * This is the decision the existing actions all pass back to the workflow author,
 * and there were three ways to settle it:
 *
 *   1. **An orphan branch in the repository** — one commit per measured push, the
 *      summary keyed by branch. No third-party service, no artifact retention
 *      window, readable by anyone with the repo, and it survives a runner going
 *      away mid-run.
 *   2. **The last successful run's artifact, through the API** — no branch to
 *      carry, but artifacts expire (90 days by default, less if configured), the
 *      lookup needs `actions: read`, and a re-run of an old workflow silently
 *      resurrects an old number.
 *   3. **Recompute the base on every pull request** — always correct, always
 *      current, and it doubles CI time on every single run.
 *
 * This ships (1). The branch is orphaned so it shares no history with the code
 * and cannot be merged into it by accident, and each write is a single commit
 * with the previous state as its parent, so the history of a branch's coverage is
 * itself readable with `git log`.
 *
 * The Git Data API is used rather than the Contents API because it is the only
 * one that can create a branch with no parent — and using it for both create and
 * update keeps one code path instead of two.
 */
const MODE_FILE = '100644';

export function baseStatePath(ref, name = '') {
  const branch = String(ref).replace(/^refs\/heads\//, '');
  const slug = branch.replaceAll('/', '-').replace(/[^\w.-]/g, '_');
  return name ? `${slug}.${slugify(name)}.json` : `${slug}.json`;
}

export async function readBaseState(client, { owner, repo, branch, path }) {
  const response = await client.get(
    `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    { allow404: true }
  );

  if (!response?.content) return null;

  try {
    return JSON.parse(
      Buffer.from(response.content, response.encoding ?? 'base64').toString(
        'utf8'
      )
    );
  } catch {
    // A corrupt state file must not fail the run — the delta is a nicety, the
    // coverage number is not. It gets overwritten by this run's own summary.
    return null;
  }
}

export async function writeBaseState(
  client,
  { owner, repo, branch, path, summary, message }
) {
  const head = await client.get(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { allow404: true }
  );
  const parent = head?.object?.sha ?? null;

  const blob = await client.post(`/repos/${owner}/${repo}/git/blobs`, {
    content: `${JSON.stringify(summary, null, 2)}\n`,
    encoding: 'utf-8'
  });

  const tree = await client.post(`/repos/${owner}/${repo}/git/trees`, {
    // Without a base_tree the commit holds this one file and nothing else, which
    // would drop every other branch's state. With it, the write is additive.
    base_tree: parent
      ? await treeOf(client, { owner, repo, commit: parent })
      : undefined,
    tree: [{ path, mode: MODE_FILE, type: 'blob', sha: blob.sha }]
  });

  const commit = await client.post(`/repos/${owner}/${repo}/git/commits`, {
    message,
    tree: tree.sha,
    parents: parent ? [parent] : []
  });

  if (parent) {
    await client.patch(
      `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        sha: commit.sha
      }
    );
  } else {
    await client.post(`/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: commit.sha
    });
  }

  return { commit: commit.sha, path, branch };
}

async function treeOf(client, { owner, repo, commit }) {
  const data = await client.get(
    `/repos/${owner}/${repo}/git/commits/${commit}`
  );
  return data.tree.sha;
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-|-$/g, '');
}
