import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalisePath } from '../src/paths.ts';

/**
 * A merge is keyed on the path. Two reports that spell the same file differently
 * merge into two files, and the total is then quietly wrong in the safe-looking
 * direction — more files, higher denominator, no error anywhere.
 */
describe('normalisePath', () => {
  const root = '/repo';

  it('makes an absolute path inside the repository relative', () => {
    assert.equal(normalisePath('/repo/src/a.js', { root }), 'src/a.js');
  });

  it('leaves an already relative path alone', () => {
    assert.equal(normalisePath('src/a.js', { root }), 'src/a.js');
  });

  it('strips a leading ./, which lcov and Istanbul disagree about', () => {
    assert.equal(normalisePath('./src/a.js', { root }), 'src/a.js');
  });

  it('joins a Cobertura <sources> root onto the filename', () => {
    assert.equal(
      normalisePath('src/a.js', { root, sourceRoots: ['/repo'] }),
      'src/a.js'
    );
  });

  it('ignores a <sources> root that does not resolve inside the repository', () => {
    // A report generated in a container carries roots that do not exist here.
    // Joining one would produce a path outside the tree and match nothing.
    assert.equal(
      normalisePath('src/a.js', { root, sourceRoots: ['/build/elsewhere'] }),
      'src/a.js'
    );
  });

  it('takes the first <sources> root that does resolve', () => {
    assert.equal(
      normalisePath('src/a.js', { root, sourceRoots: ['/nowhere', '/repo'] }),
      'src/a.js'
    );
  });

  it('normalises Windows separators, so a Windows runner keys like git does', () => {
    assert.equal(normalisePath('src\\a.js', { root }), 'src/a.js');
    assert.equal(
      normalisePath('C:\\repo\\src\\a.js', { root: 'C:\\repo' }),
      'src/a.js'
    );
  });

  it('keeps a path from another checkout usable rather than dropping it', () => {
    // A docker mount, or a report copied in from another job. There is nothing
    // to relativise against, but a key is still better than none.
    assert.equal(
      normalisePath('/elsewhere/src/a.js', { root }),
      'elsewhere/src/a.js'
    );
  });

  it('returns an empty string for nothing at all', () => {
    assert.equal(normalisePath('', { root }), '');
    assert.equal(normalisePath(undefined, { root }), '');
  });
});
