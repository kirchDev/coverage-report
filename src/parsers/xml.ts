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
// `(?=(...))\1` is the JavaScript spelling of an atomic group: the name is
// captured by a lookahead and then consumed by the backreference, so it can
// never give characters back. Without it, a long run of name characters with no
// `=` after it backtracks once per character — quadratic on input that a fork's
// branch names can reach into.
const ATTRIBUTE = /\s*(?=([\w.:-]+))\1\s*=\s*("([^"]*)"|'([^']*)')/y;

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

    let cursor = NAME.lastIndex;
    const attributes: Record<string, string> = {};

    while (cursor < xml.length) {
      ATTRIBUTE.lastIndex = cursor;
      const attribute = ATTRIBUTE.exec(xml);
      if (!attribute) break;
      attributes[attribute[1] as string] = decode(
        attribute[3] ?? attribute[4] ?? ''
      );
      cursor = ATTRIBUTE.lastIndex;
    }

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
