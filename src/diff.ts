/**
 * A unified diff, reduced to "which lines does this change add or modify, in the
 * file as it now stands".
 *
 * This is the part that decides whether the reported number is true, so it is
 * spelled out rather than inferred. The rules, in the order they bite:
 *
 *   - Only the **new** side counts. A `-` line no longer exists and cannot be
 *     covered; a context line was not touched by this change and belongs to
 *     whoever wrote it. Counting either is how a tool ends up reporting a file's
 *     coverage and calling it the patch's.
 *   - A deletion (`+++ /dev/null`) contributes nothing.
 *   - A rename or copy is followed under its **new** name, because that is the
 *     name the coverage report will use.
 *   - The hunk header's start line is authoritative and the counter walks from
 *     it; `@@ -1 +1 @@` (count omitted) means a count of 1.
 *   - `\ No newline at end of file` is a marker, not a line, and never advances
 *     the counter.
 *
 * Paths are returned repo-relative with the `a/` and `b/` prefixes stripped, so
 * they key against the same map a parsed report does.
 */
const HUNK = /^@@+ (?:-\d+(?:,\d+)? )*\+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedDiff(text) {
  const changed = new Map();

  let path = null;
  let line = 0;
  let remaining = 0;

  for (const raw of String(text).split(/\r?\n/)) {
    if (raw.startsWith('diff --git ') || raw.startsWith('--- ')) {
      path = null;
      remaining = 0;
      continue;
    }

    if (raw.startsWith('+++ ')) {
      path = readPath(raw.slice(4));
      remaining = 0;
      if (path !== null && !changed.has(path)) changed.set(path, new Set());
      continue;
    }

    const hunk = HUNK.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      remaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
      continue;
    }

    if (path === null || remaining <= 0) continue;

    // A `+` line is added, a space line is context, a `-` line is removed. Only
    // the first two advance the new-file counter; only the first is reported.
    if (raw.startsWith('+')) {
      changed.get(path).add(line);
      line += 1;
      remaining -= 1;
    } else if (raw.startsWith('-')) {
      // Consumes nothing on the new side.
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file" — belongs to the line above it.
    } else if (raw.startsWith(' ') || raw === '') {
      line += 1;
      remaining -= 1;
    } else {
      // Anything else ends the hunk: `index`, `similarity`, a trailing summary.
      remaining = 0;
    }
  }

  for (const [key, lines] of changed) {
    if (lines.size === 0) changed.delete(key);
  }

  return changed;
}

function readPath(raw) {
  const value = raw.split('\t')[0].trim();
  if (value === '/dev/null') return null;
  if (value.startsWith('b/') || value.startsWith('a/')) return value.slice(2);
  return value;
}

/**
 * Collapses `[3, 4, 5, 9, 11, 12]` into `"3-5, 9, 11-12"`. A comment that lists
 * forty individual line numbers is a comment nobody reads.
 */
export function formatLineRanges(
  lines,
  { limit = Number.POSITIVE_INFINITY } = {}
) {
  const sorted = [...lines].sort((a, b) => a - b);
  const ranges = [];

  let start = null;
  let previous = null;

  for (const line of sorted) {
    if (start === null) {
      start = line;
    } else if (line !== previous + 1) {
      ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
      start = line;
    }
    previous = line;
  }

  if (start !== null)
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);

  if (ranges.length > limit) {
    return `${ranges.slice(0, limit).join(', ')}, … (+${ranges.length - limit} more)`;
  }

  return ranges.join(', ');
}

/**
 * The `patch` field of GitHub's pull-request files endpoint: the same hunks a
 * unified diff carries, minus the file headers. Reusing the parser above rather
 * than writing a second one is deliberate — two diff readers is exactly how the
 * comment and the check run start disagreeing.
 */
export function parsePatchHunks(patch) {
  if (!patch) return new Set();
  const changed = parseUnifiedDiff(`+++ b/f\n${patch}`);
  return changed.get('f') ?? new Set();
}
