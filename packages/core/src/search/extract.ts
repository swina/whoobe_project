// Text extraction for the search index (docs/plans/search-engine/search-
// engine-plan.md §5). The backend treats whoobe_pages.content and
// data_objects.attributes as opaque jsonb - these walkers are written
// against the documented Element-tree shape (apps/whoobe-one-spike/src/
// scripts/ElementsClass.js) and the ClassFieldDefinition/attributes
// shape (packages/core/src/schema/dynamic.ts), so the indexer can turn
// either into a flat searchable text blob without the frontend types.
import type { WhoobePageRecord } from '../db/whoobe-pages-records.js';
import type { DataObjectRecord } from '../db/data-objects-records.js';
import type { DataClassRecord } from '../db/data-classes-records.js';
import type { AssetRecord } from '../db/asset-records.js';
import { hasSeoTokens } from '../cms/seo-template.js';

export interface ExtractedSearchDoc {
  title: string;
  path: string;
  category: string;
  keywords: string[];
  body: string;
  excerpt: string;
}

export const MAX_BODY_CHARS = 20_000;

export function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.7 ? cut.slice(0, lastSpace) : cut) + '…';
}

// Structural/noise keys on Element nodes that never carry user-visible
// searchable text. Everything else (content, custom attributes, nested
// collections, form data) is walked generically.
const ELEMENT_SKIP_KEYS = new Set([
  'id', 'blocks', 'css', 'tailwind', 'style', 'coords', 'gsap', 'alpine',
  'events', 'dialog', 'helper', 'icon', 'slider', 'image', 'link', 'video',
  'formConfig', 'data', 'type', 'tag', 'element', 'editable', 'level',
  'label', 'semantic', 'anchor', 'src', 'placeholder', 'value',
]);

/** Collects searchable strings from one Element node subtree (recursive). */
export function collectElementText(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  const el = node as Record<string, unknown>;

  if (typeof el.content === 'string' && el.content.trim()) out.push(el.content.trim());
  // Form inputs carry their placeholder/label/value under data.attributes.
  const attrs = (el.data as any)?.attributes;
  if (attrs && typeof attrs === 'object') {
    for (const key of ['placeholder', 'label', 'value', 'title']) {
      const v = attrs[key];
      if (typeof v === 'string' && v.trim()) out.push(v.trim());
    }
  }
  const linkText = (el.link as any)?.text;
  if (typeof linkText === 'string' && linkText.trim()) out.push(linkText.trim());
  const boundField = (el.dataBinding as any)?.field;
  if (typeof boundField === 'string' && boundField.trim()) out.push(boundField.trim());

  for (const key of Object.keys(el)) {
    if (ELEMENT_SKIP_KEYS.has(key)) continue;
    const value = el[key];
    if (Array.isArray(value)) {
      for (const item of value) collectElementText(item, out);
    } else if (value && typeof value === 'object') {
      collectElementText(value, out);
    }
  }
  for (const child of (el.blocks as unknown[]) ?? []) collectElementText(child, out);
}

/** Accepts any of the content shapes the backend has ever stored: the
 *  root node itself ({id, blocks, tag:'document', ...}), the saved-page
 *  wrapper ({build, blocks: rootNode}) or a raw array of roots. */
function pageRoots(content: unknown): unknown[] {
  if (!content || typeof content !== 'object') return [];
  const c = content as Record<string, unknown>;
  if (Array.isArray(c.blocks)) return c.blocks;
  if (c.blocks && typeof c.blocks === 'object') return [c.blocks];
  return [c];
}

/** Element tree -> searchable text for whoobe_pages rows. */
export function extractPageText(page: WhoobePageRecord): ExtractedSearchDoc {
  const text: string[] = [];
  for (const root of pageRoots(page.content)) collectElementText(root, text);

  const seo = page.seo ?? null;
  const search = page.search ?? null;
  // A dynamic page's meta fields can be `{field}` templates (cms/seo-template.ts);
  // the real value depends on the record visited, so a template is not indexed
  // as if it were text - the page title / body stand in for it.
  const metaTitle = hasSeoTokens(seo?.metaTitle) ? null : seo?.metaTitle;
  const metaDescription = hasSeoTokens(seo?.metaDescription) ? null : seo?.metaDescription;
  const title = metaTitle || page.title || '';
  const body = truncateText(text.join(' '), MAX_BODY_CHARS);
  const excerpt =
    truncateText(metaDescription || body, 300) ||
    truncateText(`Page: ${title}`, 300);

  return {
    title,
    path: page.path || page.slug || '/',
    category: page.category || '',
    keywords: [...(search?.keywords ?? []), ...(metaTitle ? [metaTitle] : [])].slice(0, 20),
    body,
    excerpt,
  };
}

/** Flattens one attribute value (scalar, nested object, array, collection)
 *  into searchable strings. Relation/asset references ({id, classId} /
 *  {assetId}) are structural, not text - skipped (best-effort label
 *  resolution would need joins; reindex-time enrichment is a documented
 *  follow-up in the plan). */
function collectAttributeText(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const s = String(value).trim();
    if (s) out.push(s);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAttributeText(item, out);
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Relations/assets/links: skip ids and the reference envelope.
    if (obj.id !== undefined && obj.classId !== undefined && Object.keys(obj).length === 2) return;
    if (obj.assetId !== undefined && Object.keys(obj).length === 1) return;
    for (const key of Object.keys(obj)) {
      if (key === 'id' || key === 'assetId' || key === 'classId' || key === 'locale') continue;
      collectAttributeText(obj[key], out);
    }
  }
}

/** data_objects.attributes -> searchable text, guided by the class field
 *  definitions (which fields exist and what they're called). `extraText`
 *  appends indexer-side enrichment (e.g. the relation display labels
 *  resolved in indexer.ts from the fields' own relationDisplayField) to
 *  the body before truncation. */
export function extractObjectText(object: DataObjectRecord, classDef: DataClassRecord, extraText: string[] = []): ExtractedSearchDoc {
  const text: string[] = [];
  for (const field of classDef.fields) {
    collectAttributeText(object.attributes?.[field.name], text);
  }
  text.push(...extraText);
  const body = truncateText(text.join(' '), MAX_BODY_CHARS);
  const title = [object.attributes?.title, object.attributes?.name, object.key]
    .find((v): v is string => typeof v === 'string' && v.trim().length > 0) || object.key;

  return {
    title: String(title),
    path: object.path && object.path !== '/' ? object.path : '',
    category: classDef.label || classDef.name,
    keywords: [classDef.name, classDef.label, ...classDef.fields.map((f) => f.title || f.name)].filter(Boolean).slice(0, 20),
    body: `${object.key} ${body}`.trim(),
    excerpt: truncateText(body, 300) || truncateText(`Object: ${title}`, 300),
  };
}

/** data_classes row itself -> a lightweight 'class' document, so searching
 *  a class name surfaces the class (per the plan's agreed scope). */
export function extractClassDoc(classDef: DataClassRecord): ExtractedSearchDoc {
  const title = classDef.label || classDef.name;
  const fieldNames = classDef.fields.map((f) => f.title || f.name);
  const body = [classDef.name, ...fieldNames].join(' ');

  return {
    title,
    path: '',
    category: 'Class',
    keywords: [classDef.name, ...fieldNames].filter(Boolean).slice(0, 20),
    body,
    excerpt: truncateText(body, 300) || title,
  };
}

/** DAM asset -> searchable text. Filename (with and without extension) is
 *  the primary key field; the folder path, mime/file type and every string
 *  inside the EXIF/metadata jsonb (technical/camera/gps/rights/raw) join
 *  the body, with the best ones promoted to keywords. */
export function extractAssetDoc(asset: AssetRecord): ExtractedSearchDoc {
  const extension = asset.filename.includes('.') ? asset.filename.slice(asset.filename.lastIndexOf('.') + 1) : '';
  const baseName = extension ? asset.filename.slice(0, asset.filename.lastIndexOf('.')) : asset.filename;

  const meta = asset.metadata;
  const t = meta?.technical ?? {};
  const bodyParts = [asset.folderPath, asset.pimcorePath, asset.mimeType, asset.fileType];
  const keywordCandidates: string[] = [asset.mimeType, asset.fileType, extension, baseName];

  if (meta) {
    const c = meta.camera ?? {};
    const g = meta.gps ?? {};
    const r = meta.rights ?? {};
    if (t.width && t.height) bodyParts.push(`${t.width}×${t.height}`);
    for (const v of [t.format, t.colorSpace, t.mimeType]) if (v) bodyParts.push(v);
    for (const v of [c.make, c.model, c.lens, c.focalLength, c.exposureTime, c.flash]) if (v) bodyParts.push(v);
    if (c.iso) bodyParts.push(`ISO ${c.iso}`);
    if (c.fNumber) bodyParts.push(`f/${c.fNumber}`);
    if (g.latitude !== undefined && g.longitude !== undefined) bodyParts.push(`GPS ${g.latitude.toFixed(5)}, ${g.longitude.toFixed(5)}`);
    for (const v of [r.artist, r.copyright, r.software]) if (v) bodyParts.push(v);
    for (const [key, value] of Object.entries(meta.raw ?? {})) {
      if (typeof value === 'string' && value.trim()) {
        bodyParts.push(value.trim());
        keywordCandidates.push(value.trim());
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        bodyParts.push(`${key} ${value}`);
      }
    }
  }

  const body = truncateText(bodyParts.filter(Boolean).join(' '), MAX_BODY_CHARS);
  const keywords = [...new Set(keywordCandidates.filter((k): k is string => !!k && k.length > 0))].slice(0, 20);

  return {
    title: asset.filename,
    path: asset.pimcorePath,
    category: asset.fileType,
    keywords,
    body: body ? `${asset.filename} ${body}` : asset.filename,
    excerpt: truncateText([asset.folderPath, asset.mimeType, `${t.width ?? ''}×${t.height ?? ''}`].filter(Boolean).join(' • '), 300) || asset.filename,
  };
}
