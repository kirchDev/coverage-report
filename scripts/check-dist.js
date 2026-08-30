#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Proves the committed bundle is the one the current source produces.
 *
 * A committed `dist/` is a second source of truth, and the failure mode is
 * silent: a fix lands in `src/`, nobody rebuilds, and every consumer keeps
 * running the old bundle while the pull request that "fixed it" is green. This
 * turns that into a red check.
 */
const scratch = mkdtempSync(join(tmpdir(), 'coverage-report-dist-'));
const candidate = join(scratch, 'index.js');

try {
  execFileSync(process.execPath, ['scripts/build.js', candidate], {
    stdio: 'pipe'
  });

  const built = readFileSync(candidate, 'utf8');
  const committed = readFileSync('dist/index.js', 'utf8');

  if (built !== committed) {
    process.stderr.write(
      'dist/index.js is not what src/ builds. Run `pnpm build` and commit the result.\n'
    );
    process.exit(1);
  }

  process.stdout.write('dist/index.js matches src/.\n');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
