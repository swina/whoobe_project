import { and, desc, eq, notInArray } from 'drizzle-orm';
import { getDb } from './client.js';
import { contentVersions } from './content-versions-schema.js';

export type ContentVersionResourceType = 'page' | 'snippet';

export interface ContentVersionRecord {
  id: string;
  resourceType: ContentVersionResourceType;
  resourceId: string;
  content: unknown;
  label: string | null;
  createdAt: Date;
}

/** Lightweight shape for the version-history list - deliberately omits
 *  `content` (can be a large tree) since the list only needs to render a
 *  date/time (and label) per entry; the full content is fetched separately,
 *  only when a specific version is actually opened/restored. */
export type ContentVersionSummary = Pick<ContentVersionRecord, 'id' | 'label' | 'createdAt'>;

/** Caps how many prior states are kept per (resourceType, resourceId) -
 *  "instant backup ... up to 10 states" per the feature request. */
const MAX_VERSIONS_PER_RESOURCE = 10;

/** Snapshots one prior state and trims older ones beyond the cap. Callers
 *  (updateWhoobePage/updateWhoobeOneSnippet) are expected to only call this
 *  when the content actually changed - an unconditional call here would
 *  otherwise let a no-op autosave tick burn through the 10-slot history. */
export async function snapshotContentVersion(input: {
  resourceType: ContentVersionResourceType;
  resourceId: string;
  content: unknown;
  label?: string | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(contentVersions).values({
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    content: input.content,
    label: input.label ?? null,
  });

  const keep = await db
    .select({ id: contentVersions.id })
    .from(contentVersions)
    .where(and(eq(contentVersions.resourceType, input.resourceType), eq(contentVersions.resourceId, input.resourceId)))
    .orderBy(desc(contentVersions.createdAt))
    .limit(MAX_VERSIONS_PER_RESOURCE);
  const keepIds = keep.map((row) => row.id);
  if (keepIds.length === 0) return;

  await db
    .delete(contentVersions)
    .where(
      and(
        eq(contentVersions.resourceType, input.resourceType),
        eq(contentVersions.resourceId, input.resourceId),
        notInArray(contentVersions.id, keepIds)
      )
    );
}

export async function listContentVersions(
  resourceType: ContentVersionResourceType,
  resourceId: string
): Promise<ContentVersionSummary[]> {
  const db = getDb();
  return db
    .select({ id: contentVersions.id, label: contentVersions.label, createdAt: contentVersions.createdAt })
    .from(contentVersions)
    .where(and(eq(contentVersions.resourceType, resourceType), eq(contentVersions.resourceId, resourceId)))
    .orderBy(desc(contentVersions.createdAt))
    .limit(MAX_VERSIONS_PER_RESOURCE);
}

export async function getContentVersion(id: string): Promise<ContentVersionRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(contentVersions).where(eq(contentVersions.id, id)).limit(1);
  return row ?? null;
}
