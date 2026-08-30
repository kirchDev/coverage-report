import { readFile } from 'node:fs/promises';
import type { Report } from '../coverage.ts';
import type { PathOptions } from '../paths.ts';
import { parseClover } from './clover.ts';
import { parseCobertura } from './cobertura.ts';
import { parseIstanbul } from './istanbul.ts';
import { parseLcov } from './lcov.ts';

export const FORMATS = ['lcov', 'cobertura', 'clover', 'istanbul'] as const;

export type Format = (typeof FORMATS)[number];

export interface ParseOptions extends PathOptions {
  /** Skip detection and read the report as this format. */
  format?: Format | null;
  /** Where the content came from, for the error message when detection fails. */
  source?: string;
}

export interface ParseResult {
  format: Format;
  report: Report;
}

const PARSERS: Record<
  Format,
  (content: string, options: PathOptions) => Report
> = {
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
export function detectFormat(content: string): Format | null {
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

export function parseContent(
  content: string,
  { format, source, ...options }: ParseOptions = {}
): ParseResult {
  const resolved = format ?? detectFormat(content);
  if (!resolved) {
    throw new UnknownFormatError(source);
  }
  const parser = PARSERS[resolved];
  if (!parser) {
    throw new Error(
      `Unsupported coverage format "${resolved}". Known: ${FORMATS.join(', ')}.`
    );
  }
  return { format: resolved, report: parser(content, options) };
}

export async function parseFile(
  path: string,
  options: ParseOptions = {}
): Promise<ParseResult> {
  const content = await readFile(path, 'utf8');
  return parseContent(content, { ...options, source: path });
}

export class UnknownFormatError extends Error {
  constructor(source?: string) {
    super(
      `Could not tell which coverage format ${source ? `"${source}"` : 'the report'} is. ` +
        `Expected one of ${FORMATS.join(', ')}; pass --format to say which.`
    );
    this.name = 'UnknownFormatError';
  }
}
