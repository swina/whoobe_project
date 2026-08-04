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
export interface PimcoreObjectClassSummary {
  id: number;
  name: string;
}

export interface PimcoreObjectSummary {
  id: number;
  classId: number;
  className: string;
  key: string;
  path: string;
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

/**
 * The raw material for one object, joined from up to three real Pimcore
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

  listObjectClasses?(): Promise<PimcoreObjectClassSummary[]>;
  listObjects?(classId: number): Promise<PimcoreObjectSummary[]>;
  getObjectAttributes?(classId: number, objectId: number): Promise<RawPimcoreObjectAttributes>;
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
