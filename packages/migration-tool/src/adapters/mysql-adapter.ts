import mysql from 'mysql2/promise';
import {
  registerPimcoreSourceAdapter,
  type PimcoreSourceAdapter,
  type PimcoreDocumentSummary,
  type PimcoreObjectClassSummary,
  type PimcoreObjectSummary,
  type RawPimcoreObjectAttributes,
} from '../source-adapter.js';
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
  // Renamed from "documents_elements" in older Pimcore versions to
  // "documents_editables" in this instance (confirmed 2026-08-02 against a
  // live Pimcore/pimcore-demo DB) - overridable via config for instances
  // still on the older name.
  documentsElementsTable: 'documents_editables',
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

    // Data Object support - see docs/plans/datamodel/advanced-data-
    // modeling-plan.md §5.2/§8 Phase 3. Table names derive directly from
    // the numeric class id (`object_<classId>`, `object_localized_<classId>_
    // <locale>`, `object_relations_<classId>`) per real Pimcore convention -
    // confirmed against a live install, not assumed from documentation.
    async listObjectClasses(): Promise<PimcoreObjectClassSummary[]> {
      const conn = requireConnection();
      const [rows] = await conn.query('SELECT id, name FROM `classes`');
      return (rows as { id: number; name: string }[]).map((row) => ({ id: row.id, name: row.name }));
    },

    async listObjects(classId: number): Promise<PimcoreObjectSummary[]> {
      const conn = requireConnection();
      const [rows] = await conn.query(
        "SELECT o_id, o_classId, o_className, o_key, o_path FROM `objects` WHERE o_classId = ? AND o_type = 'object'",
        [classId]
      );
      return (rows as { o_id: number; o_classId: number; o_className: string; o_key: string; o_path: string }[]).map((row) => ({
        id: row.o_id,
        classId: row.o_classId,
        className: row.o_className,
        key: row.o_key,
        path: row.o_path,
      }));
    },

    async getObjectAttributes(classId: number, objectId: number): Promise<RawPimcoreObjectAttributes> {
      const conn = requireConnection();

      const [columnRows] = await conn.query(`SELECT * FROM \`object_${classId}\` WHERE oo_id = ? LIMIT 1`, [objectId]);
      const columns = (columnRows as Record<string, unknown>[])[0] ?? {};

      // Discover this class's own localized-field tables rather than
      // assuming a fixed locale list - a class with no localized fields
      // at all has none of these tables (Localizedfields is optional per
      // class, confirmed: not every real class in this install uses it).
      const [localeTables] = await conn.query(
        "SHOW TABLES LIKE ?",
        [`object_localized_${classId}_%`]
      );
      const localizedByLocale: Record<string, Record<string, unknown>> = {};
      for (const tableRow of localeTables as Record<string, string>[]) {
        const tableName = Object.values(tableRow)[0];
        const locale = tableName.slice(`object_localized_${classId}_`.length);
        const [localeRows] = await conn.query(`SELECT * FROM \`${tableName}\` WHERE oo_id = ? LIMIT 1`, [objectId]);
        const row = (localeRows as Record<string, unknown>[])[0];
        if (row) localizedByLocale[locale] = row;
      }

      // The relations table only exists for classes with at least one
      // relation-shaped field - absence is a real, expected case (a
      // MySQL "table doesn't exist" error), not something to surface as
      // a real migration failure.
      let relations: RawPimcoreObjectAttributes['relations'] = [];
      try {
        const [relationRows] = await conn.query(
          `SELECT fieldname, type, dest_id FROM \`object_relations_${classId}\` WHERE src_id = ? ORDER BY fieldname, position`,
          [objectId]
        );
        relations = (relationRows as { fieldname: string; type: string; dest_id: number }[]).map((row) => ({
          fieldname: row.fieldname,
          type: row.type,
          destId: row.dest_id,
        }));
      } catch (err: any) {
        if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
      }

      return { columns, localizedByLocale, relations };
    },
  };
}

registerPimcoreSourceAdapter('mysql', (config) => createMysqlPimcoreSourceAdapter(config as unknown as MysqlPimcoreSourceConfig));
