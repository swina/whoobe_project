import { registerPimcoreSourceAdapter, type PimcoreSourceAdapter, type PimcoreDocumentSummary } from '../source-adapter.js';
import { normalizeDocumentElements, type RawDocumentElementRow } from '../pimcore-serialized-data.js';

/**
 * In-memory adapter for tests and for exercising the pipeline without a
 * live Pimcore database. Also doubles as a template for a future "export
 * file" adapter (reading a Pimcore export dump instead of a DB) - both
 * just need to produce this same dataset shape.
 */
export interface FixturePimcoreDataset {
  documents: PimcoreDocumentSummary[];
  elementRowsByDocumentId: Record<number, RawDocumentElementRow[]>;
  assetPathsById: Record<number, string>;
}

export function createFixturePimcoreSourceAdapter(dataset: FixturePimcoreDataset): PimcoreSourceAdapter {
  return {
    async connect() {
      // Nothing to connect to.
    },
    async disconnect() {
      // Nothing to disconnect from.
    },
    async listDocuments(): Promise<PimcoreDocumentSummary[]> {
      return dataset.documents;
    },
    async resolveAssetPath(assetId: number): Promise<string | null> {
      return dataset.assetPathsById[assetId] ?? null;
    },
    async getDocumentElements(documentId: number) {
      const rows = dataset.elementRowsByDocumentId[documentId] ?? [];
      return normalizeDocumentElements(rows, {
        resolveAssetPath: async (assetId: number) => dataset.assetPathsById[assetId] ?? null,
      });
    },
  };
}

registerPimcoreSourceAdapter('fixture', (config) => {
  const dataset = config.dataset as FixturePimcoreDataset | undefined;
  if (!dataset) {
    throw new Error('fixture adapter requires a "dataset" in its config (FixturePimcoreDataset).');
  }
  return createFixturePimcoreSourceAdapter(dataset);
});
