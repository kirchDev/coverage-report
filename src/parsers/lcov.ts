import {
  createReport,
  fileOf,
  recordHits,
  recordKey,
  type Report
} from '../coverage.ts';
import { normalisePath, type PathOptions } from '../paths.ts';

/**
 * lcov — what Vitest, Jest, c8 and nyc write, and what gcov has written for two
 * decades. A line-oriented format: records run from `SF:` to `end_of_record`.
 *
 *   DA:<line>,<hits>              a line and how often it ran
 *   BRDA:<line>,<block>,<branch>,<taken|->  one branch outcome
 *   FN:<line>,<name>              a function's declaration line
 *   FNDA:<hits>,<name>            that function's hit count
 *
 * The `FNF`/`FNH`/`BRF`/`BRH`/`LF`/`LH` summary records are ignored on purpose:
 * they are the file's own totals, and recomputing them from the raw records is
 * what makes a merge of two reports come out right.
 */
export function parseLcov(text: string, options: PathOptions = {}): Report {
  const report = createReport();
  let file = null;
  const functionLines = new Map();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;

    const separator = line.indexOf(':');
    const tag = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1);

    switch (tag) {
      case 'SF': {
        file = fileOf(report, normalisePath(value, options));
        functionLines.clear();
        break;
      }
      case 'DA': {
        if (!file) break;
        const [number, hits] = value.split(',');
        const lineNumber = Number(number);
        if (!Number.isFinite(lineNumber)) break;
        recordKey(file.lines, lineNumber);
        recordHits(file.lines, lineNumber, hits);
        break;
      }
      case 'BRDA': {
        if (!file) break;
        const [number, block, branch, taken] = value.split(',');
        const lineNumber = Number(number);
        if (!Number.isFinite(lineNumber)) break;
        const key = `${lineNumber}:${block}:${branch}`;
        recordKey(file.branches, key);
        // `-` means the branch was never reached at all, which is not the same
        // as reached-and-not-taken, but both are uncovered for our purposes.
        if (taken !== '-') recordHits(file.branches, key, taken);
        break;
      }
      case 'FN': {
        if (!file) break;
        const separatorIndex = value.indexOf(',');
        if (separatorIndex === -1) break;
        const lineNumber = Number(value.slice(0, separatorIndex));
        const name = value.slice(separatorIndex + 1);
        if (!Number.isFinite(lineNumber)) break;
        functionLines.set(name, lineNumber);
        recordKey(file.functions, `${lineNumber}:${name}`);
        break;
      }
      case 'FNDA': {
        if (!file) break;
        const separatorIndex = value.indexOf(',');
        if (separatorIndex === -1) break;
        const hits = value.slice(0, separatorIndex);
        const name = value.slice(separatorIndex + 1);
        const lineNumber = functionLines.get(name);
        // An FNDA without a preceding FN has no line to key on. Falling back to
        // the name alone would collide with a real `line:name` key, so it is
        // keyed on the name in a namespace of its own.
        const key =
          lineNumber === undefined ? `?:${name}` : `${lineNumber}:${name}`;
        recordKey(file.functions, key);
        recordHits(file.functions, key, hits);
        break;
      }
      case 'end_of_record': {
        file = null;
        functionLines.clear();
        break;
      }
      default:
        break;
    }
  }

  return report;
}
