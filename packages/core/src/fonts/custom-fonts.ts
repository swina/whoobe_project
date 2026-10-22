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
