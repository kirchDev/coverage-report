import assert from 'node:assert/strict';
import {
  createReport,
  fileOf,
  recordHits,
  recordKey,
  type Report
} from '../src/coverage.ts';

/**
 * Builds a report from `{ path: { line: hits } }`, which is the shape every test
 * about merging, patch coverage or rendering wants and none of them wants to
 * spell out. Hits of `0` record the line as present but never executed — the
 * distinction the whole model rests on.
 */
export function reportOf(
  files: Record<string, Record<number, number>>
): Report {
  const report = createReport();

  for (const [path, lines] of Object.entries(files)) {
    const file = fileOf(report, path);
    for (const [line, hits] of Object.entries(lines)) {
      recordKey(file.lines, Number(line));
      if (hits > 0) recordHits(file.lines, Number(line), hits);
    }
  }

  return report;
}

/**
 * Asserts a value is there and hands it back narrowed.
 *
 * Under `strict` a `Map.get` is `T | undefined`, and a test that carries on
 * regardless fails somewhere less obvious than the lookup that actually went
 * wrong. This fails at the lookup, with the name of what was missing.
 */
export function present<T>(value: T | null | undefined, what = 'value'): T {
  assert.ok(
    value !== null && value !== undefined,
    `expected ${what} to be present`
  );
  return value;
}
