import type { PimcoreEditableElement } from './pimcore-document-converter.js';

/**
 * A document node as the ETL pipeline needs it, independent of which
 * Pimcore instance/version it came from. Any source adapter (real MySQL,
 * a fixture, a future export-file reader) normalizes to this shape.
 */
export interface PimcoreDocumentSummary {
  id: number;
  parentId: number;
  type: 'page' | 'snippet' | 'folder' | 'link';
  key: string;
  path: string;
  title?: string;
}

/**
 * The plugin contract. Every concrete source (the real MySQL adapter, the
 * in-memory fixture adapter used by tests, or a future adapter for a
 * different Pimcore version/export format) implements this and nothing
 * else in the migration pipeline needs to know which one is in use - the
 * CLI and PimcoreDocumentConverter only ever talk to this interface. That's
 * what makes the tool reusable across Pimcore instances instead of tied to
 * whichever schema was true for the first one it was pointed at.
 */
/**
 * Data Object types - see docs/plans/datamodel/advanced-data-modeling-
 * plan.md §5.2/§8 Phase 3. Optional on `PimcoreSourceAdapter` (not every
 * adapter needs to support Data Object migration - the fixture adapter
 * used by the Document pipeline's own tests doesn't, and shouldn't need
 * dummy stubs just to keep satisfying the interface).
 */
/**
 * A source Pimcore asset, as migrate-assets needs it - the `assets` table
 * row plus the filesystem storage location that lets the adapter read the
 * actual file bytes (`readAssetFile`, below). `path` is the full asset path
 * INCLUDING filename (e.g. "/communication/Visore_2023.jpg"), composed from
 * the table's own `path` (parent folder) + `filename` exactly the way
 * `resolveAssetPath` already does for editables. `data` is the raw
 * `assets.data` column - Pimcore's own record of where the file lives
 * within the source install's asset directory, passed through untouched so
 * each adapter can interpret its own instance's layout.
 */
export interface PimcoreAssetSummary {
  id: number;
  /** Full asset path including filename, e.g. "/communication/Visore_2023.jpg". */
  path: string;
  filename: string;
  /** Pimcore asset type: 'image' | 'video' | 'text' | 'folder' | ... */
  type: string;
  mimetype: string;
  /** Raw `assets.data` column - the file's storage location relative to the source install's asset directory. */
  data: string;
}

/** A Pimcore class id: a number in old installs, a string (`'CAR'`) in Pimcore 10/11. It names the `object_*` tables, so it is never turned into a number. */
export type PimcoreClassId = number | string;

/** The id as the source database holds it: a number when it is all digits, else the text itself (never NaN). */
export function pimcoreClassIdOf(pimcoreId: string): PimcoreClassId {
  return /^\d+$/.test(pimcoreId) ? Number(pimcoreId) : pimcoreId;
}

export interface PimcoreObjectClassSummary {
  id: PimcoreClassId;
  name: string;
}

export interface PimcoreObjectSummary {
  id: number;
  classId: PimcoreClassId;
  className: string;
  key: string;
  path: string;
  /** Pimcore's own real `o_creationDate`/`o_modificationDate` - Unix
   *  seconds (Pimcore's own storage unit for these columns), not
   *  milliseconds. Threaded through to `data_objects.createdAt`/
   *  `updatedAt` by runObjectMigration (cli.ts) rather than letting a
   *  migration run stamp "now" on real, years-old source data. */
  creationDate: number;
  modificationDate: number;
}

/** One `object_relations_<classId>` edge - `type` is Pimcore's own real
 * relation-target kind ('asset'/'object'/'document'), `destId` is that
 * target's id in its own table (not resolved to a path/object here -
 * PimcoreObjectConverter resolves it, the same division of labor
 * getDocumentElements already uses for image/video editables). */
export interface PimcoreObjectRelationEdge {
  fieldname: string;
  type: string;
  destId: number;
}

/** One Field Collection item - `collectionType` is the Pimcore type name
 * (e.g. `"ProductBanner"`), discovered from the real
 * `object_collection_<Type>_<classId>` table name, not assumed from the
 * class definition (§6, Phase 6) - the adapter returns whatever really
 * exists in the data. `index` is Pimcore's own real ordering column,
 * shared *across every type* mixed into one field (confirmed: a real
 * Product object's `content` field interleaves `ProductVariants` at
 * index 0 with `ProductBanner` at indexes 1-3) - sorting by `index`
 * alone (not grouped by type first) reconstructs the true order. */
export interface PimcoreFieldCollectionItem {
  fieldname: string;
  collectionType: string;
  index: number;
  columns: Record<string, unknown>;
  localizedByLocale: Record<string, Record<string, unknown>>;
}

/**
 * The raw material for one object, joined from up to four real Pimcore
 * tables (see the plan's §3.2/§3.4) - `columns`/`localizedByLocale` are
 * intentionally untyped raw column dumps (`SELECT *`), not a filtered
 * subset: which columns are real class fields vs. Pimcore tree/meta
 * columns is `data_classes.fields` and the calling converter's own
 * business, not this adapter's - the same "return everything, let the
 * converter decide" shape `getDocumentElements` already normalizes into,
 * just at the raw-row level instead of already-typed editables.
 */
export interface RawPimcoreObjectAttributes {
  columns: Record<string, unknown>;
  localizedByLocale: Record<string, Record<string, unknown>>;
  relations: PimcoreObjectRelationEdge[];
  /** Optional (not every adapter/fixture needs to populate this - a class
   * with no Field Collection fields at all has none to return) rather
   * than forcing every existing caller to pass an empty array. */
  fieldCollections?: PimcoreFieldCollectionItem[];
}

export interface PimcoreSourceAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listDocuments(): Promise<PimcoreDocumentSummary[]>;
  /**
   * Returns fully-resolved editables for a document - Image/Video editables
   * store a bare numeric Pimcore asset ID, which is useless to the
   * converter on its own, so implementations resolve it to a path (via
   * resolveAssetPath) before returning here rather than leaking raw IDs
   * upstream.
   */
  getDocumentElements(documentId: number): Promise<PimcoreEditableElement[]>;
  /** Looks up an asset's full path (e.g. "/logos/hero.png") by its Pimcore asset ID. */
  resolveAssetPath(assetId: number): Promise<string | null>;

  /**
   * Asset migration support (docs/plans/cms/documents-migration.md §3 Phase 1) -
   * optional on `PimcoreSourceAdapter` the same way Data Object migration is:
   * not every adapter needs to migrate assets (the existing fixture adapter
   * didn't, and doesn't need dummy stubs just to keep satisfying the
   * interface). `listAssets` walks the source install's assets table (path-
   * keyed rows - see PimcoreAssetSummary), `readAssetFile` reads the actual
   * file bytes for one asset from the source install's filesystem. A missing
   * file (deleted at the source, broken reference) is `null`, not a throw, so
   * a single broken reference can't abort a whole migration run.
   */
  listAssets?(): Promise<PimcoreAssetSummary[]>;
  readAssetFile?(asset: PimcoreAssetSummary): Promise<Buffer | null>;

  listObjectClasses?(): Promise<PimcoreObjectClassSummary[]>;
  listObjects?(classId: PimcoreClassId): Promise<PimcoreObjectSummary[]>;
  getObjectAttributes?(classId: PimcoreClassId, objectId: number): Promise<RawPimcoreObjectAttributes>;
}

export type PimcoreSourceAdapterFactory = (config: Record<string, unknown>) => PimcoreSourceAdapter;

const registry = new Map<string, PimcoreSourceAdapterFactory>();

/**
 * Registers a new source adapter under a name the CLI's `--source` flag can
 * select. Adding support for a different Pimcore version, a different
 * database engine, or an export-file-based source is: write a file that
 * implements PimcoreSourceAdapter, call this once, and the rest of the
 * pipeline (converter, persistence, CLI) needs no changes at all.
 */
export function registerPimcoreSourceAdapter(name: string, factory: PimcoreSourceAdapterFactory): void {
  registry.set(name, factory);
}

export function createPimcoreSourceAdapter(name: string, config: Record<string, unknown> = {}): PimcoreSourceAdapter {
  const factory = registry.get(name);
  if (!factory) {
    const available = [...registry.keys()].join(', ') || '(none registered)';
    throw new Error(`Unknown Pimcore source adapter "${name}". Registered adapters: ${available}`);
  }
  return factory(config);
}

export function listRegisteredPimcoreSourceAdapters(): string[] {
  return [...registry.keys()];
}
