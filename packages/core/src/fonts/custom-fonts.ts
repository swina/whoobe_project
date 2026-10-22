// Custom fonts: what a person may register (a woff2 of the DAM with a family, weight and style) and the CSS that makes a page use it.
// Pure functions, shared by core-api (validation) and the outputs that write the `@font-face` (editor, publish, mobile-app, mail).

export const FONT_STYLES = ['normal', 'italic'] as const;
export type FontStyle = (typeof FONT_STYLES)[number];

export interface CustomFontInput { family: string; weight: number; style: FontStyle; assetPath: string }
export type CustomFontRead = { ok: true; font: CustomFontInput } | { ok: false; error: string };

/** A family name goes into CSS (`font-family: "<name>"`): letters, digits, space, hyphen and underscore only, so nothing can close the string. */
const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;

export function readCustomFontBody(body: unknown): CustomFontRead {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const family = typeof b.family === 'string' ? b.family.trim().replace(/\s+/g, ' ') : '';
  if (!FAMILY_RE.test(family)) return { ok: false, error: 'family must be 1-64 characters: letters, digits, space, hyphen or underscore' };
  const weight = b.weight === undefined ? 400 : b.weight;
  if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100 !== 0) return { ok: false, error: 'weight must be 100, 200, ... 900' };
  const style = b.style === undefined ? 'normal' : b.style;
  if (!(FONT_STYLES as readonly unknown[]).includes(style)) return { ok: false, error: 'style must be normal or italic' };
  const assetPath = typeof b.assetPath === 'string' ? b.assetPath.trim() : '';
  if (!assetPath || assetPath.length > 1024) return { ok: false, error: 'assetPath (the woff2 asset of the DAM) is required' };
  return { ok: true, font: { family, weight, style: style as FontStyle, assetPath } };
}

export interface FontFace { family: string; weight: number; style: string; url: string }

/** The `@font-face` rules for these faces; `font-display: swap` so text shows in the fallback font while the file loads. */
export function fontFaceCss(faces: readonly FontFace[]): string {
  return faces
    .map((f) => `@font-face{font-family:"${f.family.replace(/["\\]/g, '')}";font-weight:${f.weight};font-style:${f.style === 'italic' ? 'italic' : 'normal'};font-display:swap;src:url("${f.url.replace(/["\\\n\r]/g, '')}") format("woff2")}`)
    .join('\n');
}

const WEIGHT_WORDS: Record<string, number> = {
  thin: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400, medium: 500,
  semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
};
const STYLE_PART = new RegExp(`^(${Object.keys(WEIGHT_WORDS).join('|')})?(italic|oblique)?$`, 'i');

export interface GuessedFace { family: string; weight: number; style: FontStyle }

/**
 * What a font file name says about the face: `LiberationSans-BoldItalic.woff2` is family "Liberation Sans", 700, italic. The part after the last
 * `-`, `_` or space is read as weight and style words when it is made only of them (`Regular`, `Bold`, `Italic`, `SemiBoldItalic`...);
 * a name without such a part is a regular face of a family named by the whole name. A guess, shown to the person who can change it.
 */
export function guessFontFace(fileName: string): GuessedFace {
  const stem = fileName.replace(/\.woff2$/i, '').trim();
  const cut = Math.max(stem.lastIndexOf('-'), stem.lastIndexOf('_'), stem.lastIndexOf(' '));
  let base = stem;
  let weight = 400;
  let style: FontStyle = 'normal';
  if (cut > 0) {
    const part = stem.slice(cut + 1);
    const m = part ? STYLE_PART.exec(part) : null;
    if (m) {
      base = stem.slice(0, cut);
      if (m[1]) weight = WEIGHT_WORDS[m[1].toLowerCase()];
      if (m[2]) style = 'italic';
    }
  }
  // "LiberationSans" -> "Liberation Sans"; separators become spaces
  const family = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 64);
  return { family, weight, style };
}
