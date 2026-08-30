import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatLineRanges,
  parsePatchHunks,
  parseUnifiedDiff
} from '../src/diff.js';

/**
 * The diff reader is the part that decides whether patch coverage is a real
 * number or a plausible-looking one, so these tests are about the cases that
 * would each shift a line by one and go unnoticed.
 */
describe('parseUnifiedDiff', () => {
  it('reports added lines at their position in the new file', () => {
    const changed = parseUnifiedDiff(`diff --git a/src/a.js b/src/a.js
--- a/src/a.js
+++ b/src/a.js
@@ -1,3 +1,5 @@
 const a = 1;
+const b = 2;
+const c = 3;
 const d = 4;
 const e = 5;
`);

    assert.deepEqual([...changed.get('src/a.js')], [2, 3]);
  });

  it('does not count context lines as changed', () => {
    // The difference between "this file changed" and "these lines changed" —
    // and the reason a one-line fix in a big file does not drag in 400 lines
    // somebody else wrote.
    const changed = parseUnifiedDiff(`--- a/src/a.js
+++ b/src/a.js
@@ -10,4 +10,4 @@
 untouched();
-old();
+fresh();
 untouched();
`);

    assert.deepEqual([...changed.get('src/a.js')], [11]);
  });

  it('ignores removed lines, which cannot be covered by anything', () => {
    const changed = parseUnifiedDiff(`--- a/src/a.js
+++ b/src/a.js
@@ -1,3 +1,1 @@
-gone();
-alsoGone();
 kept();
`);

    assert.equal(changed.has('src/a.js'), false);
  });

  it('skips a deleted file', () => {
    const changed = parseUnifiedDiff(`diff --git a/src/gone.js b/src/gone.js
deleted file mode 100644
--- a/src/gone.js
+++ /dev/null
@@ -1,2 +0,0 @@
-one();
-two();
`);

    assert.equal(changed.size, 0);
  });

  it('follows a rename under its new name, which is what the report will use', () => {
    const changed = parseUnifiedDiff(`diff --git a/src/old.js b/src/new.js
similarity index 90%
rename from src/old.js
rename to src/new.js
--- a/src/old.js
+++ b/src/new.js
@@ -3,2 +3,3 @@
 kept();
+added();
 kept();
`);

    assert.deepEqual([...changed.get('src/new.js')], [4]);
  });

  it('reads a hunk header with the line count omitted as a count of one', () => {
    const changed = parseUnifiedDiff(`--- a/src/a.js
+++ b/src/a.js
@@ -7 +7 @@
-before();
+after();
`);

    assert.deepEqual([...changed.get('src/a.js')], [7]);
  });

  it('does not let the no-newline marker advance the line counter', () => {
    const changed = parseUnifiedDiff(`--- a/src/a.js
+++ b/src/a.js
@@ -1,2 +1,2 @@
 first();
-second();
\\ No newline at end of file
+second();
\\ No newline at end of file
`);

    assert.deepEqual([...changed.get('src/a.js')], [2]);
  });

  it('handles several files and several hunks in one diff', () => {
    const changed = parseUnifiedDiff(`--- a/src/a.js
+++ b/src/a.js
@@ -1,1 +1,2 @@
 one();
+two();
@@ -20,1 +21,2 @@
 twenty();
+twentyOne();
--- a/src/b.js
+++ b/src/b.js
@@ -5,1 +5,2 @@
 five();
+six();
`);

    assert.deepEqual([...changed.get('src/a.js')], [2, 22]);
    assert.deepEqual([...changed.get('src/b.js')], [6]);
  });

  it('reads a combined-diff header without shifting the new-side numbers', () => {
    const changed = parseUnifiedDiff(`--- a/src/a.js
+++ b/src/a.js
@@@ -1,2 -1,2 +1,3 @@@
  one();
++two();
  three();
`);

    assert.deepEqual([...changed.get('src/a.js')], [2]);
  });
});

describe('parsePatchHunks', () => {
  it('reads the hunks GitHub returns per file, with no headers around them', () => {
    const lines = parsePatchHunks(`@@ -1,2 +1,3 @@
 one();
+two();
 three();`);

    assert.deepEqual([...lines], [2]);
  });

  it('returns nothing for a file GitHub gave no patch for', () => {
    // Binary files, and files past the endpoint's per-file diff limit.
    assert.equal(parsePatchHunks(undefined).size, 0);
  });
});

describe('formatLineRanges', () => {
  it('collapses runs into ranges', () => {
    assert.equal(formatLineRanges([3, 4, 5, 9, 11, 12]), '3-5, 9, 11-12');
  });

  it('sorts before collapsing', () => {
    assert.equal(formatLineRanges([12, 3, 11, 5, 4, 9]), '3-5, 9, 11-12');
  });

  it('truncates rather than printing forty numbers into a comment', () => {
    assert.equal(
      formatLineRanges([1, 3, 5, 7, 9], { limit: 2 }),
      '1, 3, … (+3 more)'
    );
  });

  it('renders an empty set as an empty string', () => {
    assert.equal(formatLineRanges([]), '');
  });
});
