import { marker } from '../render.ts';
import type { GitHubClient } from './api.ts';

export interface CommentOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
  name?: string;
}

export interface CommentResult {
  action: 'created' | 'updated' | 'unchanged';
  id: number;
  url: string;
}

interface IssueComment {
  id: number;
  body?: string;
  html_url: string;
}

/**
 * One comment per report, edited in place.
 *
 * The comment is found by its marker line rather than by remembering an id
 * anywhere, which is what makes it survive a re-run on a different runner, a
 * re-opened pull request, and a workflow that was cancelled halfway. The search
 * is restricted to comments this token's own identity wrote, so a marker quoted
 * by a human in a review never gets overwritten.
 */
export async function upsertComment(
  client: GitHubClient,
  { owner, repo, issueNumber, body, name = '' }: CommentOptions
): Promise<CommentResult> {
  const needle = marker(name);
  const existing = await findComment(client, {
    owner,
    repo,
    issueNumber,
    needle
  });

  if (existing) {
    if (existing.body === body)
      return { action: 'unchanged', id: existing.id, url: existing.html_url };
    const updated = await client.patch(
      `/repos/${owner}/${repo}/issues/comments/${existing.id}`,
      { body }
    );
    return { action: 'updated', id: updated.id, url: updated.html_url };
  }

  const created = await client.post(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { body }
  );
  return { action: 'created', id: created.id, url: created.html_url };
}

async function findComment(
  client: GitHubClient,
  {
    owner,
    repo,
    issueNumber,
    needle
  }: { owner: string; repo: string; issueNumber: number; needle: string }
): Promise<IssueComment | null> {
  for (let page = 1; page <= 10; page += 1) {
    const comments = await client.get(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`
    );
    if (!Array.isArray(comments) || comments.length === 0) return null;

    const match = (comments as IssueComment[]).find((comment) =>
      comment.body?.includes(needle)
    );
    if (match) return match;

    if (comments.length < 100) return null;
  }
  return null;
}
