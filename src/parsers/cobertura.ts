import {
  createReport,
  fileOf,
  recordHits,
  recordKey,
  type FileCoverage,
  type Report
} from '../coverage.ts';
import { normalisePath, type PathOptions } from '../paths.ts';
import { scanTags } from './xml.ts';

/**
 * Cobertura — what Vitest's `cobertura` reporter, PHPUnit's `--coverage-cobertura`
 * and most JVM and .NET tools write.
 *
 *   <sources><source>/abs/root</source></sources>
 *   <package><classes><class filename="rel/path">
 *     <methods><method name="x" signature="()"><lines>…</lines></method></methods>
 *     <lines><line number="12" hits="3" branch="true" condition-coverage="50% (1/2)"/>
 *
 * Two things about the shape decide the parse. A single file is emitted as
 * several `<class>` elements when it declares several classes, so filenames are
 * merged rather than replaced. And the `<line>` elements inside `<methods>`
 * repeat the ones in the class body — counting both would not change line
 * coverage (keys are line numbers) but would corrupt the function metric, so the
 * scan tracks whether it is inside a method.
 */
const CONDITION = /\((\d+)\/(\d+)\)/;
const SOURCE = /<source>([^<]*)<\/source>/g;

export function parseCobertura(xml: string, options: PathOptions = {}): Report {
  const report = createReport();
  const sourceRoots = readSourceRoots(xml);
  const pathOptions = { ...options, sourceRoots };

  let file: FileCoverage | null = null;
  let method: string | null = null;
  let methodHits = 0;

  for (const tag of scanTags(xml)) {
    switch (tag.name) {
      case 'class': {
        if (tag.closing) {
          file = null;
          break;
        }
        const filename = tag.attributes.filename;
        file = filename
          ? fileOf(report, normalisePath(filename, pathOptions))
          : null;
        break;
      }

      case 'method': {
        if (tag.closing) {
          if (file && method) recordHits(file.functions, method, methodHits);
          method = null;
          methodHits = 0;
          break;
        }
        const name = `${tag.attributes.name ?? ''}${tag.attributes.signature ?? ''}`;
        method = `${tag.attributes.line ?? '?'}:${name}`;
        methodHits = 0;
        if (file) recordKey(file.functions, method);
        if (tag.selfClosing) method = null;
        break;
      }

      case 'line': {
        if (tag.closing || !file) break;
        const number = Number(tag.attributes.number);
        if (!Number.isFinite(number)) break;
        const hits = Number(tag.attributes.hits ?? 0);

        if (method !== null) {
          // A method's own lines only tell us whether the method itself ran.
          methodHits = Math.max(methodHits, Number.isFinite(hits) ? hits : 0);
          break;
        }

        recordKey(file.lines, number);
        recordHits(file.lines, number, hits);
        recordBranches(file, number, tag.attributes);
        break;
      }

      default:
        break;
    }
  }

  return report;
}

function recordBranches(
  file: FileCoverage,
  number: number,
  attributes: Record<string, string>
): void {
  if (attributes.branch !== 'true') return;
  const condition = CONDITION.exec(attributes['condition-coverage'] ?? '');
  if (!condition) return;

  const covered = Number(condition[1]);
  const total = Number(condition[2]);
  if (!Number.isFinite(covered) || !Number.isFinite(total)) return;

  // Cobertura reports how many of a line's branches were taken, never which. The
  // first `covered` of them are marked hit: the counts are what a total is built
  // from, and no format that reaches here carries branch identity anyway.
  for (let index = 0; index < total; index += 1) {
    const key = `${number}:${index}`;
    recordKey(file.branches, key);
    if (index < covered) recordHits(file.branches, key, 1);
  }
}

/**
 * `<source>` carries its value as text, and the scanner reads attributes only.
 * Rather than teach it text nodes for one element in one format, the roots are
 * lifted out with a targeted match before the walk.
 */
function readSourceRoots(xml: string): string[] {
  const roots: string[] = [];
  SOURCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SOURCE.exec(xml)) !== null) {
    const value = (match[1] ?? '').trim();
    if (value !== '' && value !== '.') roots.push(value);
  }
  return roots;
}
