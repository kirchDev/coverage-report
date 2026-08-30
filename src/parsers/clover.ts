import { createReport, fileOf, recordHits, recordKey } from '../coverage.js';
import { normalisePath } from '../paths.js';
import { scanTags } from './xml.js';

/**
 * Clover — PHPUnit's and Pest's default (`<clover outputFile="coverage.xml"/>`),
 * and the format `phpunit.xml` in a Laravel repo ships with out of the box.
 *
 *   <project><package><file name="/abs/path.php">
 *     <line num="12" type="stmt" count="3"/>
 *     <line num="20" type="method" name="handle" count="1"/>
 *     <line num="31" type="cond" truecount="1" falsecount="1"/>
 *
 * `type="method"` lines are recorded as functions only, never as lines. PHPUnit
 * counts them in its `elements` total but not in `statements`, and Cobertura
 * emits no line for them at all — so counting them here would make the same test
 * run report 809 lines as Clover and 763 as Cobertura. For a tool whose purpose
 * is merging reports, the two exports of one run have to agree.
 *
 * PHPUnit's own `coveredmethods` counts a method only when *every* line in it is
 * covered. This parser counts a function as covered when it ran at least once,
 * which is what lcov, Cobertura and Istanbul all mean by it, so a merged function
 * total stays comparable across languages.
 *
 * `truecount`/`falsecount` are the covered and uncovered paths of a condition.
 * They only appear when the driver collects branch coverage: pcov never does and
 * Xdebug only with `xdebug.mode=coverage` plus branch analysis, so a PHP report
 * with a zero branch total is the normal case, not a parse failure.
 */
export function parseClover(xml, options = {}) {
  const report = createReport();
  let file = null;

  for (const tag of scanTags(xml)) {
    if (tag.name === 'file') {
      if (tag.closing) {
        file = null;
        continue;
      }
      const name = tag.attributes.name ?? tag.attributes.path;
      file = name ? fileOf(report, normalisePath(name, options)) : null;
      continue;
    }

    if (tag.name !== 'line' || tag.closing || !file) continue;

    const number = Number(tag.attributes.num);
    if (!Number.isFinite(number)) continue;
    const count = Number(tag.attributes.count ?? 0);
    const type = tag.attributes.type ?? 'stmt';

    if (type === 'method') {
      const key = `${number}:${tag.attributes.name ?? ''}`;
      recordKey(file.functions, key);
      recordHits(file.functions, key, count);
      continue;
    }

    recordKey(file.lines, number);
    recordHits(file.lines, number, count);

    if (type === 'cond') {
      const covered = Number(tag.attributes.truecount ?? 0);
      const uncovered = Number(tag.attributes.falsecount ?? 0);
      const total = covered + uncovered;
      for (let index = 0; index < total; index += 1) {
        const key = `${number}:${index}`;
        recordKey(file.branches, key);
        if (index < covered) recordHits(file.branches, key, 1);
      }
    }
  }

  return report;
}
