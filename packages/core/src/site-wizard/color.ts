// Colour arithmetic for the template wizard: contrast (WCAG 2), mixing and the choice of a readable text colour. Pure, no dependencies.

export type RGB = [number, number, number];

export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

export function hexToRgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** Relative luminance of an sRGB colour (WCAG 2). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio of two colours, 1 to 21 (WCAG 2). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `t` = 0 gives `a`, 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export const WHITE = '#FFFFFF';
export const NEAR_BLACK = '#0B0F14';
export const BLACK = '#000000';

/**
 * White or near-black, whichever reads better on `bg`; pure black on the middle greys where neither reaches 4.5:1 (near-black is not dark enough there:
 * about 4.38 on the worst grey). White, near-black or black always reaches 4.5:1 on any background (pure black alone: 4.58 at worst).
 */
export function readableOn(bg: string): string {
  const [w, n] = [contrast(WHITE, bg), contrast(NEAR_BLACK, bg)];
  if (Math.max(w, n) >= 4.5) return w >= n ? WHITE : NEAR_BLACK;
  return BLACK;
}

/**
 * `fg` moved toward white or black (whichever gives the better contrast) just far enough to reach `min` against every background in `bgs`;
 * `fg` itself when it already does. When `min` cannot be reached the best that is reachable is returned.
 */
export function ensureContrast(fg: string, bgs: string[], min: number): string {
  const worst = (c: string) => Math.min(...bgs.map((bg) => contrast(c, bg)));
  if (worst(fg) >= min) return fg;
  const extreme = worst(WHITE) >= worst(BLACK) ? WHITE : BLACK;
  for (let t = 0.02; t <= 1.0001; t += 0.02) {
    const c = mix(fg, extreme, t);
    if (worst(c) >= min) return c;
  }
  return extreme;
}
