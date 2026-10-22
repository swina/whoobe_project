// The content of an uploaded file must be what its extension says. The browser's Content-Type is never looked at: it is
// whatever the sender wrote. Only the first bytes are needed (`SNIFF_BYTES`), so the check can run on the first chunk of a
// stream, before anything is stored.

/** How many leading bytes the check wants. */
export const SNIFF_BYTES = 4096;

type Head = Uint8Array;

const ascii = (head: Head, at: number, text: string): boolean => {
  if (head.length < at + text.length) return false;
  for (let i = 0; i < text.length; i++) if (head[at + i] !== text.charCodeAt(i)) return false;
  return true;
};
const bytes = (head: Head, at: number, values: number[]): boolean => head.length >= at + values.length && values.every((v, i) => head[at + i] === v);

/** Plain text: valid UTF-8 and no control bytes other than tab, newline, carriage return. */
function isPlainText(head: Head): boolean {
  if (head.length === 0) return false;
  for (const b of head) if (b === 0 || (b < 32 && b !== 9 && b !== 10 && b !== 13) || b === 127) return false;
  try {
    // the head may end in the middle of a character: allow a cut at the end
    new TextDecoder('utf-8', { fatal: true }).decode(head.length === SNIFF_BYTES ? head.subarray(0, head.length - 3) : head);
    return true;
  } catch {
    return false;
  }
}

const zip = (h: Head) => bytes(h, 0, [0x50, 0x4b, 0x03, 0x04]) || bytes(h, 0, [0x50, 0x4b, 0x05, 0x06]);
const ole = (h: Head) => bytes(h, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const CHECKS: Record<string, (h: Head) => boolean> = {
  pdf: (h) => ascii(h, 0, '%PDF-'),
  png: (h) => bytes(h, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: (h) => bytes(h, 0, [0xff, 0xd8, 0xff]),
  jpeg: (h) => bytes(h, 0, [0xff, 0xd8, 0xff]),
  gif: (h) => ascii(h, 0, 'GIF87a') || ascii(h, 0, 'GIF89a'),
  webp: (h) => ascii(h, 0, 'RIFF') && ascii(h, 8, 'WEBP'),
  wav: (h) => ascii(h, 0, 'RIFF') && ascii(h, 8, 'WAVE'),
  mp3: (h) => ascii(h, 0, 'ID3') || (h.length > 1 && h[0] === 0xff && (h[1] & 0xe0) === 0xe0),
  mp4: (h) => ascii(h, 4, 'ftyp'),
  m4a: (h) => ascii(h, 4, 'ftyp'),
  mov: (h) => ascii(h, 4, 'ftyp') || ascii(h, 4, 'moov') || ascii(h, 4, 'wide'),
  zip,
  // Office Open XML and OpenDocument files are zip containers
  docx: zip, xlsx: zip, pptx: zip, odt: zip, ods: zip, odp: zip,
  doc: ole, xls: ole, ppt: ole,
  rtf: (h) => ascii(h, 0, '{\\rtf'),
  txt: isPlainText,
  csv: isPlainText,
  md: isPlainText,
};

/** Extensions the content check knows: only these can be allowed for a website. */
export const SNIFFABLE_EXTENSIONS: ReadonlySet<string> = new Set(Object.keys(CHECKS));

/** True when the leading bytes are those of a file with this extension. An extension the check does not know is never accepted. */
export function contentMatchesExtension(extension: string, head: Head): boolean {
  const check = CHECKS[extension.toLowerCase()];
  return check ? check(head) : false;
}

/** A web font file: woff2 starts with the signature `wOF2`. Not part of CHECKS: a website's visitors may not upload fonts, only people of the DAM. */
export const isWoff2 = (head: Head): boolean => ascii(head, 0, 'wOF2');
