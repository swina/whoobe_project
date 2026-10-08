// Front matter of a documentation page: an optional YAML block between two `---` lines at the very top of the file.
// Pure: no I/O. Anything unusable is ignored and reported in `warnings`, never thrown - a bad header must not make a document unreadable.
import { load } from 'js-yaml';

export interface FrontMatter {
  title?: string;
  description?: string;
  /** Position among its siblings in the automatic index (lower first). */
  order?: number;
  /** Not listed in the index; still reachable by its address. */
  hidden?: boolean;
  /** Last segment of the address instead of the file name. */
  slug?: string;
}

export interface ParsedDocument {
  frontMatter: FrontMatter;
  body: string;
  warnings: string[];
}

const BLOCK = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const SLUG = /^[a-z0-9][a-z0-9_-]*$/i;

export function parseDocument(source: string): ParsedDocument {
  const warnings: string[] = [];
  const match = BLOCK.exec(source);
  if (!match) return { frontMatter: {}, body: source.replace(/^﻿/, ''), warnings };
  const body = source.slice(match[0].length);
  let data: unknown;
  try {
    data = load(match[1]);
  } catch (e) {
    warnings.push(`front matter ignored: ${(e as Error).message.split('\n')[0]}`);
    return { frontMatter: {}, body, warnings };
  }
  if (data === null || data === undefined) return { frontMatter: {}, body, warnings };
  if (typeof data !== 'object' || Array.isArray(data)) {
    warnings.push('front matter ignored: it must be a list of key: value lines');
    return { frontMatter: {}, body, warnings };
  }
  const raw = data as Record<string, unknown>;
  const fm: FrontMatter = {};
  if (raw.title !== undefined) { if (typeof raw.title === 'string' || typeof raw.title === 'number') fm.title = String(raw.title).trim(); else warnings.push('title ignored: not text'); }
  if (raw.description !== undefined) { if (typeof raw.description === 'string') fm.description = raw.description.trim(); else warnings.push('description ignored: not text'); }
  if (raw.order !== undefined) { if (typeof raw.order === 'number' && Number.isFinite(raw.order)) fm.order = raw.order; else warnings.push('order ignored: not a number'); }
  if (raw.hidden !== undefined) { if (typeof raw.hidden === 'boolean') fm.hidden = raw.hidden; else warnings.push('hidden ignored: use true or false'); }
  if (raw.slug !== undefined) { if (typeof raw.slug === 'string' && SLUG.test(raw.slug.trim())) fm.slug = raw.slug.trim(); else warnings.push('slug ignored: letters, digits, - and _ only'); }
  return { frontMatter: fm, body, warnings };
}
