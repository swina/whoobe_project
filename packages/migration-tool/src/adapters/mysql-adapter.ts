import mysql from 'mysql2/promise';
import { registerPimcoreSourceAdapter, type PimcoreSourceAdapter, type PimcoreDocumentSummary } from '../source-adapter.js';
import { normalizeDocumentElements, type RawDocumentElementRow } from '../pimcore-serialized-data.js';

/**
 * Connection info plus table/column name overrides. The overrides exist
 * because this adapter is built against the documented, historically
 * stable Pimcore schema (see docs/plans/cms/pimcore-areablock-import-plan.md,
 * Phase 0) - if a specific installation's schema differs, that's a config
 * change here, not a code change, which is the whole point of keeping this
 * adapter separate from the rest of the pipeline.
 */
export interface MysqlPimcoreSourceConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  documentsTable?: string;
  documentsElementsTable?: string;
  assetsTable?: string;
}

const DEFAULT_TABLES = {
  documentsTable: 'documents',
  documentsElementsTable: 'documents_elements',
  assetsTable: 'assets',
};

interface DocumentRow {
  id: number;
  parentId: number;
  type: string;
  key: string;
  path: string;
}

interface AssetRow {
  path: string;
  filename: string;
}

export function createMysqlPimcoreSourceAdapter(config: MysqlPimcoreSourceConfig): PimcoreSourceAdapter {
  const documentsTable = config.documentsTable ?? DEFAULT_TABLES.documentsTable;
  const documentsElementsTable = config.documentsElementsTable ?? DEFAULT_TABLES.documentsElementsTable;
  const assetsTable = config.assetsTable ?? DEFAULT_TABLES.assetsTable;

  let connection: mysql.Connection | null = null;

  function requireConnection(): mysql.Connection {
    if (!connection) {
      throw new Error('MySQL Pimcore source adapter used before connect() - call connect() first.');
    }
    return connection;
  }

  async function resolveAssetPath(assetId: number): Promise<string | null> {
    const conn = requireConnection();
    const [rows] = await conn.query(`SELECT path, filename FROM \`${assetsTable}\` WHERE id = ? LIMIT 1`, [assetId]);
    const row = (rows as AssetRow[])[0];
    if (!row) return null;
    const parentPath = row.path === '/' ? '' : row.path.replace(/\/+$/, '');
    return `${parentPath}/${row.filename}`;
  }

  return {
    async connect() {
      connection = await mysql.createConnection({
        host: config.host,
        port: config.port ?? 3306,
        user: config.user,
        password: config.password,
        database: config.database,
      });
    },

    async disconnect() {
      await connection?.end();
      connection = null;
    },

    async listDocuments(): Promise<PimcoreDocumentSummary[]> {
      const conn = requireConnection();
      const [rows] = await conn.query(
        `SELECT id, parentId, type, \`key\`, path FROM \`${documentsTable}\` WHERE type IN ('page', 'snippet')`
      );
      return (rows as DocumentRow[]).map((row) => ({
        id: row.id,
        parentId: row.parentId,
        type: row.type as PimcoreDocumentSummary['type'],
        key: row.key,
        path: row.path,
      }));
    },

    resolveAssetPath,

    async getDocumentElements(documentId: number) {
      const conn = requireConnection();
      const [rows] = await conn.query(
        `SELECT documentId, name, type, data FROM \`${documentsElementsTable}\` WHERE documentId = ?`,
        [documentId]
      );
      const rawRows: RawDocumentElementRow[] = (rows as RawDocumentElementRow[]).map((row) => ({
        documentId: row.documentId,
        name: row.name,
        type: row.type,
        data: row.data,
      }));

      return normalizeDocumentElements(rawRows, { resolveAssetPath });
    },
  };
}

registerPimcoreSourceAdapter('mysql', (config) => createMysqlPimcoreSourceAdapter(config as unknown as MysqlPimcoreSourceConfig));
