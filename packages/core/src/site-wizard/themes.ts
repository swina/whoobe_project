// Colour roles of a generated site. A palette is eight colours, each with one job; every block is written in these roles, so a theme is only a choice of
// palette. Four presets, or a company colour used as the background of the site, from which the other roles are derived. Every text pair is held to WCAG AA
// by construction and by test (themes.test.ts), for the presets and for a spread of company colours.
import { contrast, ensureContrast, isHex, mix, NEAR_BLACK, readableOn, WHITE } from './color.js';

export interface Palette {
  /** the page and the plain sections */
  bg: string;
  /** the alternate sections */
  bgAlt: string;
  /** boxes, cards and form fields */
  card: string;
  text: string;
  muted: string;
  border: string;
  /** button background and highlights */
  accent: string;
  /** text on the accent */
  onAccent: string;
}

export const PRESET_NAMES = ['dark', 'light', 'light-colors', 'blue-navy'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export type ThemeChoice = { preset: PresetName } | { palette: string } | { background: string };

export const PALETTE_ROLES = ['bg', 'bgAlt', 'card', 'text', 'muted', 'border', 'accent', 'onAccent'] as const;

/** The roles of a palette a person typed in: all eight, each #RRGGBB (upper-cased). Returns the palette, or what is wrong. */
export function parsePalette(input: unknown): { ok: true; palette: Palette } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const src = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const role of PALETTE_ROLES) {
    const v = src[role];
    if (typeof v !== 'string' || !isHex(v)) issues.push(`"${role}" must be a colour written as #RRGGBB`);
    else out[role] = v.toUpperCase();
  }
  for (const k of Object.keys(src)) if (!(PALETTE_ROLES as readonly string[]).includes(k)) issues.push(`"${k}" is not a colour of a palette`);
  return issues.length ? { ok: false, issues } : { ok: true, palette: out as unknown as Palette };
}

/** The pairs of a palette that do not reach the contrast they need, in words (empty: all readable). A person's palette is saved either way; this is the warning. */
export function weakPairs(p: Palette): string[] {
  return palettePairs(p).filter((x) => contrast(x.fg, x.bg) < x.min).map((x) => `${x.name}: contrast ${contrast(x.fg, x.bg).toFixed(1)}, needs ${x.min}`);
}

export const PRESETS: Record<PresetName, Palette> = {
  dark: { bg: '#0F1115', bgAlt: '#161A22', card: '#1B2030', text: '#F1F5F9', muted: '#A9B4C6', border: '#2A3142', accent: '#8B5CF6', onAccent: '#0B0F14' },
  light: { bg: '#FFFFFF', bgAlt: '#F1F5F9', card: '#FFFFFF', text: '#0F172A', muted: '#475569', border: '#E2E8F0', accent: '#4F46E5', onAccent: '#FFFFFF' },
  'light-colors': { bg: '#FFFBF5', bgAlt: '#FDEFD9', card: '#FFFFFF', text: '#1F2937', muted: '#4B5563', border: '#F1D9B5', accent: '#C2410C', onAccent: '#FFFFFF' },
  'blue-navy': { bg: '#0B1F3A', bgAlt: '#0F2A4D', card: '#13365F', text: '#F8FAFC', muted: '#B9C7DB', border: '#24497A', accent: '#F59E0B', onAccent: '#0B0F14' },
};

export interface DerivedPalette { palette: Palette; /** what was changed to keep the result readable, in words */ notes: string[] }

/** The palette of a site from a company colour: the background. `accent` is optional. */
export function derivePalette(background: string, accent?: string): DerivedPalette {
  if (!isHex(background)) throw new Error('the company colour must be #RRGGBB');
  if (accent !== undefined && !isHex(accent)) throw new Error('the accent colour must be #RRGGBB');
  const bg = background.toUpperCase();
  const notes: string[] = [];

  // the text colour is the one that reads on the background itself (pure black on the middle greys, where white and near-black both fall short)
  const base = readableOn(bg);
  const textIsWhite = base === WHITE;

  // Sections and cards are shades of the background. The usual direction is lighter on dark and darker on light; where that would cost the text its contrast
  // (a middle grey) they go the other way, away from the text colour.
  const shade = (amount: number): string => {
    const usual = mix(bg, textIsWhite ? WHITE : NEAR_BLACK, amount);
    if (contrast(base, usual) >= 5) return usual;
    return mix(bg, textIsWhite ? NEAR_BLACK : WHITE, amount);
  };
  const bgAlt = shade(0.05);
  const card = shade(0.1);
  const surfaces = [bg, bgAlt, card];

  const text = ensureContrast(mix(base, bg, 0.04), surfaces, 7);
  const border = mix(bg, text, 0.22);
  const muted = ensureContrast(mix(text, bg, 0.32), surfaces, 4.5);

  const wanted = (accent ?? (textIsWhite ? '#8B5CF6' : '#4F46E5')).toUpperCase();
  const visible = ensureContrast(wanted, surfaces, 3);
  if (visible !== wanted) notes.push(accent ? 'The accent colour was lightened or darkened to stay visible on the background.' : 'The accent was adjusted to stay visible on the background.');
  return { palette: { bg, bgAlt, card, text, muted, border, accent: visible, onAccent: readableOn(visible) }, notes };
}

export function paletteFor(theme: ThemeChoice, accent?: string, custom: Record<string, Palette> = {}): DerivedPalette {
  if ('preset' in theme || 'palette' in theme) {
    const own = 'palette' in theme;
    const p = 'preset' in theme ? PRESETS[theme.preset] : custom[theme.palette];
    if (!p) throw new Error('the palette does not exist (any more)');
    const notes: string[] = [];
    let palette = p;
    if (accent) {
      const wanted = accent.toUpperCase();
      const visible = ensureContrast(wanted, [p.bg, p.bgAlt, p.card], 3);
      palette = { ...p, accent: visible, onAccent: readableOn(visible) };
      if (visible !== wanted) notes.push('The accent colour was lightened or darkened to stay visible on the background.');
    }
    // a palette of a person is used as it is; what is hard to read in it is said, not changed
    if (own) for (const w of weakPairs(palette)) notes.push(`A colour of the palette is hard to read - ${w}.`);
    return { palette, notes };
  }
  return derivePalette(theme.background, accent);
}

/** Every pair of colours that a block draws on top of another, with the contrast it must reach. Used by the tests and by the wizard's own check. */
export function palettePairs(p: Palette): { name: string; fg: string; bg: string; min: number }[] {
  const out: { name: string; fg: string; bg: string; min: number }[] = [];
  for (const [surface, bg] of [['bg', p.bg], ['bgAlt', p.bgAlt], ['card', p.card]] as const) {
    out.push({ name: `text on ${surface}`, fg: p.text, bg, min: 4.5 });
    out.push({ name: `muted text on ${surface}`, fg: p.muted, bg, min: 4.5 });
    out.push({ name: `accent against ${surface}`, fg: p.accent, bg, min: 3 });
  }
  out.push({ name: 'text on the accent', fg: p.onAccent, bg: p.accent, min: 4.5 });
  return out;
}
