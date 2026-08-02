import { phpUnserialize } from './php-unserialize.js';
import type { PhpValue } from './php-unserialize.js';
import type { PimcoreEditableElement, PimcoreAreablockBrickInstance } from './pimcore-document-converter.js';

/**
 * A single row from Pimcore's `documents_elements` table, before any
 * type-specific parsing. Column names are what's documented/stable across
 * recent Pimcore versions; if a specific instance differs, the mysql
 * adapter is the only place that needs to change to produce this shape -
 * everything below only depends on this normalized row.
 */
export interface RawDocumentElementRow {
  documentId: number;
  name: string;
  type: string;
  data: string | null;
}

export interface AssetPathResolver {
  resolveAssetPath(assetId: number): Promise<string | null>;
}

const PLAIN_STRING_TYPES = new Set(['input', 'textarea', 'wysiwyg']);

function extractField(value: PhpValue, key: string): PhpValue | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return (value as Record<string, PhpValue>)[key];
  }
  return undefined;
}

function asNumber(value: PhpValue | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

function asString(value: PhpValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Pimcore's Image/Video editables serialize a reference to an asset by its
 * numeric ID (commonly under an "id" key) rather than its path - resolved
 * here via the adapter so callers only ever see usable paths.
 */
async function resolveImageLikeData(
  raw: string,
  resolver: AssetPathResolver
): Promise<{ path: string; alt?: string }> {
  const parsed = phpUnserialize(raw);
  const assetId = asNumber(extractField(parsed, 'id'));
  const path = assetId !== null ? await resolver.resolveAssetPath(assetId) : null;
  const alt = asString(extractField(parsed, 'alt') ?? extractField(parsed, 'title'));
  return { path: path ?? '', alt };
}

/**
 * An Areablock's own `data` column holds only the ORDERED SLOT LIST (which
 * brick type sits in each position, and whether it's hidden) - each brick's
 * own fields are separate sibling `documents_elements` rows, matched below
 * by name rather than nested inside this column. The exact key names PHP
 * uses per slot ("type"/"hidden" here) are the part of this file most
 * likely to need adjusting once Phase 0's live-schema spike (see
 * docs/plans/cms/pimcore-areablock-import-plan.md) confirms them against a
 * real instance - isolated to this one function for that reason.
 */
function parseAreablockSlotList(raw: string): Array<{ index: number; brickType: string; hidden: boolean }> {
  const parsed = phpUnserialize(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry, index) => {
      const type = asString(extractField(entry, 'type'));
      if (!type) return null;
      const hidden = extractField(entry, 'hidden') === true;
      return { index, brickType: type, hidden };
    })
    .filter((slot): slot is { index: number; brickType: string; hidden: boolean } => slot !== null);
}

/**
 * Matches a sibling documents_elements row name to a given areablock slot.
 * Pimcore prefixes a brick's own editable names with the areablock's name,
 * slot index, and brick type (e.g. "content:0:herobanner.headline") - the
 * exact separator/format is an assumption pending Phase 0 confirmation,
 * kept isolated here so it's a one-function fix if reality differs.
 */
export function matchesAreablockSlot(elementName: string, areablockName: string, slotIndex: number, brickType: string): boolean {
  const prefix = `${areablockName}:${slotIndex}:${brickType}.`;
  return elementName.startsWith(prefix);
}

/** Strips the areablock/slot/brick prefix, leaving the brick's own field name (e.g. "headline"). */
function areablockFieldName(elementName: string, areablockName: string, slotIndex: number, brickType: string): string {
  const prefix = `${areablockName}:${slotIndex}:${brickType}.`;
  return elementName.slice(prefix.length);
}

export interface NormalizeContext {
  /** All raw rows for the same document, needed so areablock slots can find their own brick sub-editables among siblings. */
  siblingRows: RawDocumentElementRow[];
  resolver: AssetPathResolver;
}

/**
 * Areablock sub-field rows (e.g. "content:0:herobanner.headline") aren't
 * independent top-level editables - they're only meaningful as a specific
 * brick instance's fields, consumed when their owning areablock row is
 * normalized. Returns the set of sibling row names that belong to some
 * areablock row in this same set, so callers can exclude them from the
 * top-level result.
 */
export function collectConsumedAreablockFieldNames(rows: RawDocumentElementRow[]): Set<string> {
  const consumed = new Set<string>();

  for (const row of rows) {
    if (row.type !== 'areablock' || !row.data) continue;
    const slots = parseAreablockSlotList(row.data);
    for (const slot of slots) {
      for (const sibling of rows) {
        if (matchesAreablockSlot(sibling.name, row.name, slot.index, slot.brickType)) {
          consumed.add(sibling.name);
        }
      }
    }
  }

  return consumed;
}

/**
 * The single reusable entry point adapters call once they have the raw
 * documents_elements rows for a document: filters out areablock sub-field
 * rows (folded into their owning areablock instead), normalizes the rest,
 * and resolves asset references via the given resolver. Keeps this logic
 * shared rather than duplicated per adapter.
 */
export async function normalizeDocumentElements(
  rows: RawDocumentElementRow[],
  resolver: AssetPathResolver
): Promise<PimcoreEditableElement[]> {
  const consumedNames = collectConsumedAreablockFieldNames(rows);
  const context: NormalizeContext = { siblingRows: rows, resolver };

  const results: PimcoreEditableElement[] = [];
  for (const row of rows) {
    if (consumedNames.has(row.name)) continue;
    const normalized = await normalizeDocumentElementRow(row, context);
    if (normalized) results.push(normalized);
  }
  return results;
}

export async function normalizeDocumentElementRow(
  row: RawDocumentElementRow,
  context: NormalizeContext
): Promise<PimcoreEditableElement | null> {
  if (row.data === null || row.data === undefined) return null;

  if (PLAIN_STRING_TYPES.has(row.type)) {
    return { name: row.name, type: row.type as 'input' | 'textarea' | 'wysiwyg', data: row.data };
  }

  switch (row.type) {
    case 'image': {
      const data = await resolveImageLikeData(row.data, context.resolver);
      return { name: row.name, type: 'image', data };
    }

    case 'video': {
      const data = await resolveImageLikeData(row.data, context.resolver);
      return { name: row.name, type: 'video', data: { path: data.path } };
    }

    case 'href':
    case 'multihref': {
      return { name: row.name, type: row.type, data: phpUnserialize(row.data) };
    }

    case 'snippet': {
      return { name: row.name, type: 'snippet', data: phpUnserialize(row.data) };
    }

    case 'areablock': {
      const slots = parseAreablockSlotList(row.data);
      const bricks: PimcoreAreablockBrickInstance[] = [];

      for (const slot of slots) {
        if (slot.hidden) continue;

        const brickFieldRows = context.siblingRows.filter((sibling) =>
          matchesAreablockSlot(sibling.name, row.name, slot.index, slot.brickType)
        );

        const fields: Record<string, PimcoreEditableElement> = {};
        for (const fieldRow of brickFieldRows) {
          const normalized = await normalizeDocumentElementRow(fieldRow, context);
          if (normalized) {
            const fieldName = areablockFieldName(fieldRow.name, row.name, slot.index, slot.brickType);
            fields[fieldName] = { ...normalized, name: fieldName };
          }
        }

        bricks.push({ brickType: slot.brickType, fields });
      }

      return { name: row.name, type: 'areablock', data: bricks };
    }

    default:
      // Unrecognized editable type: surfaced as null so the caller can log
      // and skip it, rather than silently dropping or crashing the whole
      // document's conversion over one unsupported field.
      return null;
  }
}
