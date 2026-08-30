import { readFile } from 'node:fs/promises';
import { parseClover } from './clover.js';
import { parseCobertura } from './cobertura.js';
import { parseIstanbul } from './istanbul.js';
import { parseLcov } from './lcov.js';

export const FORMATS = ['lcov', 'cobertura', 'clover', 'istanbul'];

const PARSERS = {
  lcov: parseLcov,
  cobertura: parseCobertura,
  clover: parseClover,
  istanbul: parseIstanbul
};

/**
 * Detection is by content, never by file name. `coverage.xml` is Clover in a
 * Laravel repo and Cobertura in a .NET one, and `lcov.info` is whatever the
 * runner was told to write — a report is what it says it is on line one.
 */
export function detectFormat(content) {
  const head = content.slice(0, 4096);

  if (/^\s*[{[]/.test(head)) return 'istanbul';
  if (/<coverage[\s>]/.test(head)) {
    // Both XML formats open with `<coverage>`; the child element separates them.
    if (/<project[\s>]/.test(head)) return 'clover';
    return 'cobertura';
  }
  if (/<project[\s>]/.test(head)) return 'clover';
  if (/^\s*(TN:|SF:)/m.test(head)) return 'lcov';

  return null;
}

export function parseContent(content, { format, ...options } = {}) {
  const resolved = format ?? detectFormat(content);
  if (!resolved) {
    throw new UnknownFormatError(options.source);
  }
  const parser = PARSERS[resolved];
  if (!parser) {
    throw new Error(
      `Unsupported coverage format "${resolved}". Known: ${FORMATS.join(', ')}.`
    );
  }
  return { format: resolved, report: parser(content, options) };
}

export async function parseFile(path, options = {}) {
  const content = await readFile(path, 'utf8');
  return parseContent(content, { ...options, source: path });
}

export class UnknownFormatError extends Error {
  constructor(source) {
    super(
      `Could not tell which coverage format ${source ? `"${source}"` : 'the report'} is. ` +
        `Expected one of ${FORMATS.join(', ')}; pass --format to say which.`
    );
    this.name = 'UnknownFormatError';
  }
}
