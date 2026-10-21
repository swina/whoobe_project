import { describe, expect, it } from 'vitest';
import { contrast, ensureContrast, hexToRgb, isHex, luminance, mix, readableOn, rgbToHex } from './color.js';
import { derivePalette, palettePairs, paletteFor, parsePalette, weakPairs, PRESET_NAMES, PRESETS, type Palette } from './themes.js';

const failures = (p: Palette): string[] => palettePairs(p).filter((x) => contrast(x.fg, x.bg) < x.min).map((x) => `${x.name}: ${contrast(x.fg, x.bg).toFixed(2)} < ${x.min} (${x.fg} on ${x.bg})`);

describe('colour arithmetic', () => {
  it('knows the contrast of black and white and of a colour with itself', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('round-trips hex, mixes and recognises a hex colour', () => {
    expect(rgbToHex(hexToRgb('#12ab9f'))).toBe('#12AB9F');
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(isHex('#ABCDEF')).toBe(true);
    for (const bad of ['ABCDEF', '#ABCDE', '#ABCDEG', 'red', '', null, 3]) expect(isHex(bad)).toBe(false);
  });

  it('readableOn always reaches 4.5 on any colour, the middle greys included (the worst case is about 4.58)', () => {
    let worst = 99;
    for (let v = 0; v <= 255; v++) {
      const bg = rgbToHex([v, v, v]);
      worst = Math.min(worst, contrast(readableOn(bg), bg));
    }
    for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 15) for (let b = 0; b <= 255; b += 15) {
      const bg = rgbToHex([r, g, b]);
      worst = Math.min(worst, contrast(readableOn(bg), bg));
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it('ensureContrast leaves a good colour alone and moves a bad one just enough', () => {
    expect(ensureContrast('#FFFFFF', ['#000000'], 4.5)).toBe('#FFFFFF');
    const moved = ensureContrast('#777777', ['#808080'], 4.5);
    expect(contrast(moved, '#808080')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the four presets', () => {
  for (const name of PRESET_NAMES) {
    it(`${name}: every text pair reaches WCAG AA, the accent is visible, the text on the accent reads`, () => {
      expect(failures(PRESETS[name])).toEqual([]);
    });
  }

  it('an accent colour given with a preset is kept when it is visible and corrected when it is not', () => {
    expect(paletteFor({ preset: 'dark' }, '#FF6B6B').palette.accent).toBe('#FF6B6B');
    const dim = paletteFor({ preset: 'dark' }, '#101010');
    expect(contrast(dim.palette.accent, PRESETS.dark.bg)).toBeGreaterThanOrEqual(3);
    expect(dim.notes.length).toBe(1);
    expect(failures(dim.palette)).toEqual([]);
  });
});

describe('a company colour', () => {
  it('turns #323932 into a readable palette: light text, shades of the background', () => {
    const { palette } = derivePalette('#323932');
    expect(palette.bg).toBe('#323932');
    expect(readableOn('#323932')).toBe('#FFFFFF');
    expect(contrast(palette.text, palette.bg)).toBeGreaterThanOrEqual(7);
    expect(palette.bgAlt).not.toBe(palette.bg);
    expect(palette.card).not.toBe(palette.bgAlt);
    expect(failures(palette)).toEqual([]);
  });

  it('gives a light palette on a light colour', () => {
    const { palette } = derivePalette('#F5E6C8');
    expect(readableOn('#F5E6C8')).toBe('#0B0F14');
    expect(failures(palette)).toEqual([]);
  });

  it('is readable for a spread of colours: every hue and lightness step, the greys, the extremes, with and without an accent', () => {
    const hsl = (h: number, s: number, l: number): string => {
      const a = s * Math.min(l, 1 - l);
      const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
      return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
    };
    const backgrounds: string[] = [];
    for (let h = 0; h < 360; h += 30) for (const s of [0.25, 0.6, 1]) for (let l = 0; l <= 1.0001; l += 0.1) backgrounds.push(hsl(h, s, Math.min(1, l)));
    for (let v = 0; v <= 255; v += 5) backgrounds.push(rgbToHex([v, v, v]));
    backgrounds.push('#323932', '#808080', '#6A6A6A', '#B3B3B3', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FFFFFF', '#000000');
    const accents: (string | undefined)[] = [undefined, '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FFFFFF', '#000000', '#808080'];
    const bad: string[] = [];
    for (const bg of backgrounds) for (const accent of accents) {
      const f = failures(derivePalette(bg, accent).palette);
      if (f.length) bad.push(`${bg} / ${accent ?? 'default accent'}: ${f.join('; ')}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(backgrounds.length * accents.length).toBeGreaterThan(2500);
  });

  it('is deterministic and refuses what is not a colour', () => {
    expect(derivePalette('#323932', '#FF6B6B')).toEqual(derivePalette('#323932', '#FF6B6B'));
    expect(() => derivePalette('red')).toThrowError(/#RRGGBB/);
    expect(() => derivePalette('#323932', 'blue')).toThrowError(/#RRGGBB/);
  });
});

describe('palettes made by a person', () => {
  const mine: Palette = { ...PRESETS.light, accent: '#FF69B4', onAccent: '#FFFFFF' };   // white on hot pink: hard to read

  it('reads the eight roles, upper-cases them, and says what is wrong', () => {
    const ok = parsePalette({ ...PRESETS.light, bg: '#ffffff' });
    expect(ok.ok && ok.palette.bg).toBe('#FFFFFF');
    const bad = parsePalette({ bg: 'white', text: '#000', extra: '#FFFFFF' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues.some((i) => i.includes('"bg"'))).toBe(true);
      expect(bad.issues.some((i) => i.includes('"card"'))).toBe(true);        // a missing role
      expect(bad.issues.some((i) => i.includes('"extra"'))).toBe(true);       // an unknown one
    }
    expect(parsePalette(null).ok).toBe(false);
  });

  it('the built-in presets have no weak pair; a palette of a person is used as it is and the weak pairs are said', () => {
    for (const name of PRESET_NAMES) expect(weakPairs(PRESETS[name]), name).toEqual([]);
    expect(weakPairs(mine).length).toBeGreaterThan(0);
    const out = paletteFor({ palette: 'p1' }, undefined, { p1: mine });
    expect(out.palette).toEqual(mine);                                           // not changed
    expect(out.notes.some((n) => n.includes('hard to read'))).toBe(true);
    expect(paletteFor({ palette: 'p1' }, undefined, { p1: PRESETS.dark }).notes).toEqual([]);
  });

  it('an accent over a palette of a person is kept visible, and a palette that does not exist is refused', () => {
    const out = paletteFor({ palette: 'p1' }, '#FFFFFF', { p1: PRESETS.light });
    expect(contrast(out.palette.accent, PRESETS.light.bg)).toBeGreaterThanOrEqual(3);
    expect(() => paletteFor({ palette: 'gone' }, undefined, {})).toThrow(/does not exist/);
  });
});
