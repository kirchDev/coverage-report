/**
 * A tag scanner, deliberately not an XML parser.
 *
 * Cobertura and Clover are both flat attribute formats: every number this tool
 * needs sits in an attribute of `<class>`, `<file>`, `<line>` or `<method>`, and
 * no report carries mixed content, namespaces that matter, or text nodes worth
 * reading. A scanner that walks tags in document order and hands back their
 * attributes covers both formats completely, and it keeps the parser dependency
 * count at zero — which is what lets `action.yml` point straight at bundled
 * source with nothing to audit behind it.
 *
 * It is still a scanner, so it must not be pointed at arbitrary XML. What it
 * does handle, because real reports contain them: the prolog, DOCTYPE,
 * comments, CDATA sections, and both quote styles.
 */

const NAME = /[A-Za-z_][\w.:-]*/y;

/**
 * Attributes are read character by character rather than by a pattern.
 *
 * The pattern this replaced — `\s*([\w.:-]+)\s*=\s*("..."|'...')` — had a
 * backtracking seam at every `\s*`: a long run of spaces or name characters
 * with nothing valid after it is rescanned once per character. That input is
 * not ours to trust, because a coverage report carries file paths and on a pull
 * request from a fork those come from the fork's branch. Making each quantifier
 * atomic is possible and unreadable; scanning is neither.
 *
 * Every step below advances the cursor or stops, so the whole tag is one pass.
 */
function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function isNameChar(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90) || // A-Z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 || // _
    code === 46 || // .
    code === 58 || // :
    code === 45 // -
  );
}

function skipSpace(xml: string, from: number): number {
  let cursor = from;
  while (cursor < xml.length && isSpace(xml.charCodeAt(cursor))) cursor += 1;
  return cursor;
}

/**
 * Reads `name="value"` pairs until something that is not one, and reports where
 * it stopped so the caller can find the tag's `>` past any quoted `>` inside a
 * value.
 */
function readAttributes(
  xml: string,
  from: number
): { attributes: Record<string, string>; cursor: number } {
  const attributes: Record<string, string> = {};
  let cursor = from;

  for (;;) {
    const nameStart = skipSpace(xml, cursor);
    let nameEnd = nameStart;
    while (nameEnd < xml.length && isNameChar(xml.charCodeAt(nameEnd)))
      nameEnd += 1;
    if (nameEnd === nameStart) return { attributes, cursor };

    const equals = skipSpace(xml, nameEnd);
    if (xml[equals] !== '=') return { attributes, cursor };

    const quote = skipSpace(xml, equals + 1);
    const quoteChar = xml[quote];
    if (quoteChar !== '"' && quoteChar !== "'") return { attributes, cursor };

    const valueEnd = xml.indexOf(quoteChar, quote + 1);
    if (valueEnd === -1) return { attributes, cursor };

    attributes[xml.slice(nameStart, nameEnd)] = decode(
      xml.slice(quote + 1, valueEnd)
    );
    cursor = valueEnd + 1;
  }
}

export interface Tag {
  name: string;
  attributes: Record<string, string>;
  closing: boolean;
  selfClosing: boolean;
}

export function* scanTags(xml: string): Generator<Tag> {
  let index = 0;

  while (index < xml.length) {
    const open = xml.indexOf('<', index);
    if (open === -1) return;

    if (xml.startsWith('<!--', open)) {
      index = skipTo(xml, open, '-->');
      continue;
    }
    if (xml.startsWith('<![CDATA[', open)) {
      index = skipTo(xml, open, ']]>');
      continue;
    }
    if (xml.startsWith('<?', open)) {
      index = skipTo(xml, open, '?>');
      continue;
    }
    if (xml.startsWith('<!', open)) {
      index = skipTo(xml, open, '>');
      continue;
    }

    const closing = xml[open + 1] === '/';
    NAME.lastIndex = open + (closing ? 2 : 1);
    const name = NAME.exec(xml);
    if (!name) {
      index = open + 1;
      continue;
    }

    const { attributes, cursor } = readAttributes(xml, NAME.lastIndex);

    const end = xml.indexOf('>', cursor);
    if (end === -1) return;

    yield {
      name: name[0],
      attributes,
      closing,
      selfClosing: xml[end - 1] === '/'
    };

    index = end + 1;
  }
}

function skipTo(xml: string, from: number, terminator: string): number {
  const end = xml.indexOf(terminator, from);
  return end === -1 ? xml.length : end + terminator.length;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'"
};

function decode(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g,
    (entity: string) => {
      const named = ENTITIES[entity];
      if (named !== undefined) return named;
      const codePoint = entity.startsWith('&#x')
        ? Number.parseInt(entity.slice(3, -1), 16)
        : Number.parseInt(entity.slice(2, -1), 10);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : entity;
    }
  );
}
