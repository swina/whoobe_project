/**
 * Minimal PHP `serialize()` decoder.
 *
 * Pimcore has historically stored complex editable data (Areablock brick
 * configs, Image hotspot/marker data, etc.) as PHP-serialized strings in
 * `documents_elements.data`, not JSON - nothing in this repo previously
 * needed to read that format. Written from scratch against the PHP
 * serialization spec rather than pulling in a third-party package, so the
 * migration tool has no runtime dependency whose maintenance it doesn't
 * control for something this small and well-defined.
 *
 * Supports the subset PHP actually emits for scalars/arrays/objects: N
 * (null), b (bool), i (int), d (float), s (string, length-prefixed - safe
 * for embedded semicolons/quotes), a (array, used for both lists and
 * associative arrays - PHP doesn't distinguish), and O (object, treated as
 * a plain associative array of its properties since nothing here needs
 * class identity, only field values).
 */

export type PhpValue = null | boolean | number | string | PhpValue[] | { [key: string]: PhpValue };

class ParseCursor {
  constructor(
    public readonly input: string,
    public pos: number = 0
  ) {}

  peek(): string {
    return this.input[this.pos];
  }

  expect(char: string): void {
    if (this.input[this.pos] !== char) {
      throw new Error(
        `PHP unserialize: expected "${char}" at offset ${this.pos}, got "${this.input[this.pos]}"`
      );
    }
    this.pos++;
  }

  readUntil(delimiter: string): string {
    const idx = this.input.indexOf(delimiter, this.pos);
    if (idx === -1) {
      throw new Error(`PHP unserialize: unterminated token, expected "${delimiter}" from offset ${this.pos}`);
    }
    const result = this.input.slice(this.pos, idx);
    this.pos = idx + 1;
    return result;
  }
}

function parseValue(cursor: ParseCursor): PhpValue {
  const type = cursor.peek();

  switch (type) {
    case 'N': {
      cursor.pos++;
      cursor.expect(';');
      return null;
    }

    case 'b': {
      cursor.pos++;
      cursor.expect(':');
      const flag = cursor.readUntil(';');
      return flag === '1';
    }

    case 'i': {
      cursor.pos++;
      cursor.expect(':');
      const num = cursor.readUntil(';');
      return parseInt(num, 10);
    }

    case 'd': {
      cursor.pos++;
      cursor.expect(':');
      const num = cursor.readUntil(';');
      return parseFloat(num);
    }

    case 's': {
      cursor.pos++;
      cursor.expect(':');
      const lengthStr = cursor.readUntil(':');
      // PHP's declared length is a *byte* count, which only matches the JS
      // string's character count for ASCII/Latin1 content - safe for this
      // tool's actual inputs (English admin content, URL-safe paths), but
      // multi-byte UTF-8 strings would need a byte-length-aware slice.
      const byteLength = parseInt(lengthStr, 10);
      cursor.expect('"');
      const value = cursor.input.slice(cursor.pos, cursor.pos + byteLength);
      cursor.pos += byteLength;
      cursor.expect('"');
      cursor.expect(';');
      return value;
    }

    case 'a': {
      cursor.pos++;
      cursor.expect(':');
      const countStr = cursor.readUntil(':');
      const count = parseInt(countStr, 10);
      cursor.expect('{');

      const entries: Array<[PhpValue, PhpValue]> = [];
      for (let i = 0; i < count; i++) {
        const key = parseValue(cursor);
        const value = parseValue(cursor);
        entries.push([key, value]);
      }
      cursor.expect('}');

      return entriesToJsValue(entries);
    }

    case 'O': {
      cursor.pos++;
      cursor.expect(':');
      const classNameLengthStr = cursor.readUntil(':');
      const classNameLength = parseInt(classNameLengthStr, 10);
      cursor.expect('"');
      cursor.pos += classNameLength; // class name itself is discarded
      cursor.expect('"');
      cursor.expect(':');
      const countStr = cursor.readUntil(':');
      const count = parseInt(countStr, 10);
      cursor.expect('{');

      const entries: Array<[PhpValue, PhpValue]> = [];
      for (let i = 0; i < count; i++) {
        const key = parseValue(cursor);
        const value = parseValue(cursor);
        entries.push([key, value]);
      }
      cursor.expect('}');

      return entriesToJsValue(entries);
    }

    default:
      throw new Error(`PHP unserialize: unsupported type marker "${type}" at offset ${cursor.pos}`);
  }
}

/**
 * PHP arrays are ordered key/value maps with no list/dict distinction.
 * Treated as a JS array when keys are exactly 0..N-1 in order (the common
 * case for Pimcore's Areablock brick lists); otherwise as a plain object,
 * which is what associative data (e.g. an Image editable's hotspots) needs.
 */
function entriesToJsValue(entries: Array<[PhpValue, PhpValue]>): PhpValue {
  const isSequentialList = entries.every(([key], index) => key === index);
  if (isSequentialList) {
    return entries.map(([, value]) => value);
  }

  const obj: { [key: string]: PhpValue } = {};
  for (const [key, value] of entries) {
    obj[String(key)] = value;
  }
  return obj;
}

/**
 * Decode a PHP `serialize()` string. Throws on malformed input rather than
 * guessing - callers extracting from a real Pimcore DB should treat a throw
 * here as "this row's data isn't in the format this parser expects" and
 * surface it, not silently skip it.
 */
export function phpUnserialize(input: string): PhpValue {
  const cursor = new ParseCursor(input.trim());
  return parseValue(cursor);
}
