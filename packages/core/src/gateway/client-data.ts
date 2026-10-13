// What an API client sees of a Data Object (docs/plans/api-gateway/client-access-hub.md, phase 2 "data"). Pure functions, no I/O.
// The client gets the published object's own content and nothing about how the workspace manages it: no class id, folder path,
// parent, workflow state, import id or creation date, and only the attributes the Data Class defines.

import type { ClassFieldDefinition } from '../schema/dynamic.js';
import type { DataObjectFilterLike } from './client-data-types.js';

export interface ClientObjectSource {
  id: string; key: string; locale: string; translationGroupId: string;
  publishedAt: Date | string | null; updatedAt: Date | string;
  attributes: Record<string, unknown>;
}

export function projectClientObject(obj: ClientObjectSource, fields: readonly ClassFieldDefinition[]): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  for (const f of fields) if (Object.prototype.hasOwnProperty.call(obj.attributes ?? {}, f.name)) attributes[f.name] = obj.attributes[f.name];
  return {
    id: obj.id, key: obj.key, locale: obj.locale, translationGroupId: obj.translationGroupId,
    publishedAt: obj.publishedAt, updatedAt: obj.updatedAt, attributes,
  };
}

const OPERATORS = new Set(['eq', 'neq', 'contains', 'gt', 'lt']);
const TOP_LEVEL = new Set(['key', 'locale', 'updatedAt']);
const INTERNAL = new Set(['path', 'id', 'classId', 'pimcoreId', 'translationGroupId', 'published', 'workflowState', 'createdAt', 'publishedAt']);
export const CLIENT_DATA_MAX_FILTERS = 5;
export const CLIENT_DATA_MAX_LIMIT = 100;
export const CLIENT_DATA_DEFAULT_LIMIT = 50;

export interface ClientDataQuery {
  filters: DataObjectFilterLike[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit: number;
  offset: number;
  locale?: string;
}

/**
 * `?filter=field:op:value` (repeat up to 5 times), `orderBy=field`, `dir=asc|desc`, `limit` (1-100, default 50), `offset`, `locale`.
 * A field is one of the class's own fields, or `key`, `locale`, `updatedAt`; nothing else can be filtered or sorted on.
 */
export function parseClientDataQuery(query: Record<string, unknown>, fields: readonly ClassFieldDefinition[]): ClientDataQuery | { error: string } {
  // an attribute that shares its name with an internal column would be read from the column by the query: not filterable
  const known = new Set<string>([...fields.map((f) => f.name).filter((n) => !INTERNAL.has(n)), ...TOP_LEVEL]);
  const rawFilters = query.filter === undefined ? [] : Array.isArray(query.filter) ? query.filter : [query.filter];
  if (rawFilters.length > CLIENT_DATA_MAX_FILTERS) return { error: `At most ${CLIENT_DATA_MAX_FILTERS} filters` };
  const filters: DataObjectFilterLike[] = [];
  for (const raw of rawFilters) {
    if (typeof raw !== 'string') return { error: 'filter must be field:operator:value' };
    const [field, operator, ...rest] = raw.split(':');
    if (!field || !known.has(field)) return { error: `Unknown field in filter: ${String(field).slice(0, 60)}` };
    if (!OPERATORS.has(operator)) return { error: `Unknown operator: ${String(operator).slice(0, 20)} (eq, neq, contains, gt, lt)` };
    const value = rest.join(':');
    if (value.length > 200) return { error: 'Filter value is too long' };
    filters.push({ field, operator: operator as DataObjectFilterLike['operator'], value });
  }
  let orderBy: ClientDataQuery['orderBy'];
  if (query.orderBy !== undefined) {
    if (typeof query.orderBy !== 'string' || !known.has(query.orderBy)) return { error: 'Unknown field in orderBy' };
    const dir = query.dir === undefined ? 'asc' : query.dir;
    if (dir !== 'asc' && dir !== 'desc') return { error: 'dir must be asc or desc' };
    orderBy = { field: query.orderBy, direction: dir };
  }
  const num = (v: unknown, def: number, min: number, max: number, name: string): number | { error: string } => {
    if (v === undefined || v === '') return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return { error: `${name} must be a whole number from ${min} to ${max}` };
    return n;
  };
  const limit = num(query.limit, CLIENT_DATA_DEFAULT_LIMIT, 1, CLIENT_DATA_MAX_LIMIT, 'limit');
  if (typeof limit === 'object') return limit;
  const offset = num(query.offset, 0, 0, 100000, 'offset');
  if (typeof offset === 'object') return offset;
  let locale: string | undefined;
  if (query.locale !== undefined) {
    if (typeof query.locale !== 'string' || !/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/.test(query.locale)) return { error: 'Invalid locale' };
    locale = query.locale;
  }
  return { filters, orderBy, limit, offset, locale };
}
