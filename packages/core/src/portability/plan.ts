import type { BundleAsset } from './bundle.js';
import { uniqueAssetPath } from './refs.js';

// Decisions of the importer that do not need the database: what to do with each asset, and whether the class that
// already exists on this installation is the same as the one in the bundle.

export type AssetAction = 'upload' | 'reuse' | 'conflict';

export interface AssetPlanItem {
  id: string;
  pimcorePath: string;
  /** upload: not here yet. reuse: a record with this path and size exists. conflict: this path holds another file. */
  action: AssetAction;
  existingId?: string;
  /** Where the file is to be stored: the path it had, or a free one for a conflict. */
  targetPath: string;
}

export function planAssets(
  assets: readonly BundleAsset[],
  existing: ReadonlyMap<string, { id: string; sizeBytes: number }>,
): AssetPlanItem[] {
  const taken = new Set(existing.keys());
  for (const a of assets) taken.add(a.pimcorePath);
  const items: AssetPlanItem[] = [];
  for (const a of assets) {
    const here = existing.get(a.pimcorePath);
    if (!here) { items.push({ id: a.id, pimcorePath: a.pimcorePath, action: 'upload', targetPath: a.pimcorePath }); continue; }
    if (here.sizeBytes === a.sizeBytes) { items.push({ id: a.id, pimcorePath: a.pimcorePath, action: 'reuse', existingId: here.id, targetPath: a.pimcorePath }); continue; }
    const targetPath = uniqueAssetPath(a.pimcorePath, taken);
    taken.add(targetPath);
    items.push({ id: a.id, pimcorePath: a.pimcorePath, action: 'conflict', existingId: here.id, targetPath });
  }
  return items;
}

interface FieldLike { name?: unknown; fieldType?: unknown; relationTarget?: unknown }

/** Differences between two field lists, by field name and type: what would make objects of the bundle not fit the
 *  class that is already installed. Empty = same shape. */
export function diffClassFields(installed: readonly unknown[], incoming: readonly unknown[]): string[] {
  const index = (fields: readonly unknown[]) => new Map((fields as FieldLike[]).map((f) => [String(f.name), f]));
  const have = index(installed);
  const want = index(incoming);
  const out: string[] = [];
  for (const [name, f] of want) {
    const h = have.get(name);
    if (!h) out.push(`field "${name}" is missing here`);
    else if (h.fieldType !== f.fieldType) out.push(`field "${name}" is ${String(h.fieldType)} here, ${String(f.fieldType)} in the bundle`);
  }
  return out;
}
