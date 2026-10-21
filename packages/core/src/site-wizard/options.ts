// What the wizard offers a person: the lists of its steps, with their labels. Pure (no database): the route adds the snippets of the library.
import { BLOCK_TYPES, SECTORS, SNIPPET_BLOCK_TYPES, COPY, type BlockType, type Sector } from './copy.js';
import { PRESET_NAMES, PRESETS, type PresetName } from './themes.js';
import { suggestedStructure } from './wizard.js';

export const SECTOR_LABELS: Record<Sector, string> = { it: 'IT', food: 'Food', consultant: 'Consultant', insurance: 'Insurance', tourism: 'Tourism' };

export const BLOCK_INFO: Record<BlockType, { label: string; description: string }> = {
  hero: { label: 'Hero', description: 'The opening of a page: a heading, a line, buttons and a picture.' },
  banner: { label: 'Banner', description: 'A narrow band with one message and a link.' },
  cta: { label: 'Call to action', description: 'A closing box with a heading, a line and a button.' },
  'box-grid-3': { label: 'Box grid 3', description: 'A heading and three boxes with a title and a text each.' },
  'box-grid-6': { label: 'Box grid 6', description: 'A heading and six boxes, in two rows of three.' },
  form: { label: 'Contact form', description: 'A form with name, email and message. It is not connected: a developer connects it later.' },
  title: { label: 'Page title', description: 'A plain band with the title of the page, as its heading of the first level. Not needed when a hero carries the heading.' },
};

export const PRESET_LABELS: Record<PresetName, string> = { dark: 'Dark', light: 'Light', 'light-colors': 'Light colours', 'blue-navy': 'Blue navy' };

export const WIZARD_LIMITS = { maxPages: 4, maxBlocksPerPage: 10, maxNameLength: 60, maxContextLength: 120 } as const;

/** The block a snippet of the library can stand for, from its category ("Hero", "call-to-action", "box grid 3"); null when it matches none. */
export function snippetBlockType(category: string | null | undefined): BlockType | null {
  const c = (category ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const aliases: Record<string, BlockType> = { hero: 'hero', banner: 'banner', cta: 'cta', 'call-to-action': 'cta', 'box-grid-3': 'box-grid-3', 'box-grid-6': 'box-grid-6', form: 'form', 'contact-form': 'form' };
  return aliases[c] ?? null;
}

/** The block a snippet stands for in the wizard: the one it was marked with, else the one its category names, else none. */
export function snippetWizardBlock(snippet: { category: string | null | undefined; wizardBlock?: string | null }): BlockType | 'custom' | null {
  const marked = (SNIPPET_BLOCK_TYPES as readonly string[]).includes(snippet.wizardBlock ?? '') ? (snippet.wizardBlock as BlockType | 'custom') : null;
  return marked ?? snippetBlockType(snippet.category);
}

export function wizardOptions() {
  return {
    limits: WIZARD_LIMITS,
    sectors: SECTORS.map((id) => ({ id, label: SECTOR_LABELS[id], defaultContext: COPY[id].thing, suggested: suggestedStructure(id) })),
    blocks: BLOCK_TYPES.map((type) => ({ type, ...BLOCK_INFO[type] })),
    themes: PRESET_NAMES.map((id) => ({ id, label: PRESET_LABELS[id], palette: PRESETS[id] })),
    fonts: [{ id: 'sans', label: 'Sans-serif' }, { id: 'serif', label: 'Serif' }],
    // The source of the texts: placeholders now; the configured AI in a later phase (docs/plans/ai/template-wizard.md).
    texts: { placeholderLanguages: ['en'], ai: { available: false } },
  };
}
