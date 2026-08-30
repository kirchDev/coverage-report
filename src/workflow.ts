import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';

/**
 * The parts of `@actions/core` this action actually uses, which is five of them.
 *
 * Workflow commands are a documented text protocol on stdout, and the two file
 * channels (`GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`) are append-only text files.
 * Reimplementing that surface is ~40 lines; depending on it is a package, its
 * transitive tree, and a Dependabot PR every month for code that has not changed
 * since 2022.
 *
 * The one subtlety worth keeping: an output value containing a newline has to go
 * through the heredoc form, or the runner reads the first line and drops the
 * rest — which is exactly what a markdown body is.
 */
export const core = {
  info(message: string): void {
    process.stdout.write(`${message}\n`);
  },

  warn(message: string): void {
    process.stdout.write(`::warning::${escapeData(message)}\n`);
  },

  error(message: string): void {
    process.stdout.write(`::error::${escapeData(message)}\n`);
  },

  fail(message: string): void {
    process.stdout.write(`::error::${escapeData(message)}\n`);
    process.exitCode = 1;
  },

  setOutput(name: string, value: string): void {
    const file = process.env.GITHUB_OUTPUT;
    if (!file) return;

    // The delimiter must be unguessable, and the value must not contain it.
    // Outputs here carry file paths taken from the pull request, which a fork
    // controls: a value holding a line equal to the delimiter would close the
    // heredoc early and everything after it would be read by the runner as
    // further outputs. A timestamp is guessable; a UUID is not.
    const delimiter = `ghadelimiter_${randomUUID()}`;
    if (name.includes(delimiter) || value.includes(delimiter)) {
      throw new Error(
        `Refusing to write output "${name}": it contains the delimiter.`
      );
    }

    appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
  },

  summary(markdown: string): void {
    const file = process.env.GITHUB_STEP_SUMMARY;
    if (!file) return;
    appendFileSync(file, `${markdown}\n`);
  }
};

function escapeData(value: unknown): string {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}
