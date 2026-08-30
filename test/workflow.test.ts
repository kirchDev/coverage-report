import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { core } from '../src/workflow.ts';
import { present } from './helpers.ts';

/**
 * `GITHUB_OUTPUT` is a file the runner parses, so writing to it is writing a
 * command language — and the values written here carry file paths taken from
 * the pull request, which a fork controls.
 */
describe('setOutput', () => {
  let directory: string;
  let file: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'coverage-report-output-'));
    file = join(directory, 'output');
    process.env.GITHUB_OUTPUT = file;
  });

  afterEach(() => {
    delete process.env.GITHUB_OUTPUT;
    rmSync(directory, { recursive: true, force: true });
  });

  it('writes a value as a heredoc, so a multi-line body survives', () => {
    core.setOutput('markdown', 'first\nsecond');
    const written = readFileSync(file, 'utf8');

    assert.match(written, /^markdown<<ghadelimiter_/);
    assert.ok(written.includes('first\nsecond'));
  });

  it('uses a fresh, unguessable delimiter each time', () => {
    // A delimiter derived from the clock is guessable within a window, which is
    // all an injection needs.
    core.setOutput('a', 'one');
    core.setOutput('b', 'two');

    const delimiters = [
      ...readFileSync(file, 'utf8').matchAll(/ghadelimiter_(\S+)/g)
    ].map((match) => match[1]);

    assert.equal(new Set(delimiters).size, 2);
    assert.doesNotMatch(delimiters.join(' '), /^\d+$/);
  });

  it('cannot be broken out of by a value that looks like a delimiter', () => {
    // The attack: a value holding the closing line would end the heredoc early,
    // and everything after it becomes further outputs — the runner would read
    // `GITHUB_TOKEN=…` as one. The invariant that prevents it is that the
    // delimiter appears exactly twice, opening and closing, whatever the value.
    core.setOutput(
      'markdown',
      'ghadelimiter_guess\nGITHUB_TOKEN=stolen\nx<<ghadelimiter_guess'
    );

    const written = readFileSync(file, 'utf8');
    const delimiter = present(
      /ghadelimiter_[\w-]+/.exec(written)?.[0],
      'the delimiter'
    );

    assert.equal(written.split(delimiter).length - 1, 2);
    assert.ok(written.endsWith(`${delimiter}\n`));
  });

  it('does nothing at all outside a workflow', () => {
    delete process.env.GITHUB_OUTPUT;
    assert.doesNotThrow(() => core.setOutput('markdown', 'anything'));
  });
});
