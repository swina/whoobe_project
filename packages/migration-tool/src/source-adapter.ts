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
