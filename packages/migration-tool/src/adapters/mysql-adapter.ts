import mysql from 'mysql2/promise';
import {
  registerPimcoreSourceAdapter,
  type PimcoreSourceAdapter,
  type PimcoreDocumentSummary,
  type PimcoreObjectClassSummary,
  type PimcoreObjectSummary,
  type RawPimcoreObjectAttributes,
  type PimcoreFieldCollectionItem,
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
        charset: 'utf8mb4',
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

      // Field Collections (§6, Phase 6) - discovered the same way locale
      // tables are (SHOW TABLES LIKE, not a hardcoded/assumed type list),
      // since which collection types a class actually uses in its real
      // data isn't knowable without asking the database. Table names
      // embed the type directly: `object_collection_<Type>_<classId>`
      // (own columns) and `object_collection_<Type>_localized_<classId>`
      // (localized columns, one shared table per type across every
      // locale - a *different* convention than top-level objects' own
      // per-locale tables, confirmed against real data, not assumed).
      const [collectionTables] = await conn.query('SHOW TABLES LIKE ?', [`object_collection_%_${classId}`]);
      const localizedSuffix = new RegExp(`^object_collection_(.+)_localized_${classId}$`);
      const plainSuffix = new RegExp(`^object_collection_(.+)_${classId}$`);
      const plainTableByType = new Map<string, string>();
      const localizedTableByType = new Map<string, string>();
      for (const tableRow of collectionTables as Record<string, string>[]) {
        const tableName = Object.values(tableRow)[0];
        const localizedMatch = localizedSuffix.exec(tableName);
        if (localizedMatch) {
          localizedTableByType.set(localizedMatch[1], tableName);
          continue;
        }
        const plainMatch = plainSuffix.exec(tableName);
        if (plainMatch) plainTableByType.set(plainMatch[1], tableName);
      }

      // (fieldname, index, collectionType) -> the item being assembled,
      // since the plain and localized rows for the same item arrive from
      // two separate queries and need merging back together.
      const itemsByKey = new Map<string, PimcoreFieldCollectionItem>();
      function keyFor(fieldname: string, index: number, collectionType: string): string {
        return `${fieldname} ${index} ${collectionType}`;
      }

      for (const [collectionType, tableName] of plainTableByType) {
        const [rows] = await conn.query(`SELECT * FROM \`${tableName}\` WHERE o_id = ?`, [objectId]);
        for (const row of rows as Record<string, unknown>[]) {
          const { o_id, fieldname, index, ...rest } = row as any;
          itemsByKey.set(keyFor(fieldname, index, collectionType), {
            fieldname,
            collectionType,
            index,
            columns: rest,
            localizedByLocale: {},
          });
        }
      }
      for (const [collectionType, tableName] of localizedTableByType) {
        const [rows] = await conn.query(`SELECT * FROM \`${tableName}\` WHERE ooo_id = ?`, [objectId]);
        for (const row of rows as Record<string, unknown>[]) {
          const { ooo_id, fieldname, index, language, ...rest } = row as any;
          const key = keyFor(fieldname, index, collectionType);
          let item = itemsByKey.get(key);
          if (!item) {
            // A field collection item can be all-localized-fields with no
            // non-localized columns at all - still a real item, not one
            // to silently drop just because the plain table pass above
            // never created an entry for it.
            item = { fieldname, collectionType, index, columns: {}, localizedByLocale: {} };
            itemsByKey.set(key, item);
          }
          item.localizedByLocale[language as string] = rest;
        }
      }

      const fieldCollections = [...itemsByKey.values()].sort((a, b) => a.index - b.index);

      return { columns, localizedByLocale, relations, fieldCollections };
    },
  };
}

registerPimcoreSourceAdapter('mysql', (config) => createMysqlPimcoreSourceAdapter(config as unknown as MysqlPimcoreSourceConfig));
