export interface SchemaField {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any' | 'null';
  nullable: boolean;
  sample: unknown;
  items?: { type: string; nullable: boolean; fields?: SchemaField[]; sample?: unknown };
  fields?: SchemaField[];
}

export interface InferredSchema {
  type: 'object' | 'array';
  fields?: SchemaField[];
  items?: { type: string; nullable: boolean; fields?: SchemaField[]; sample?: unknown };
}

// An array is described by ALL its items, not by the first one: a field that the first record lacks (or has as null) is still a
// field of the response, and the column / field pickers built on this schema would otherwise never offer it. Capped so a very
// large response does not make the probe slow.
const MAX_ITEMS = 500;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One field described by every value seen for it. `undefined` stands for "this record does not have the key" and, like null,
 *  makes the field nullable. The type, sample and nested fields come from the values that are there; if they disagree on the
 *  type, the first one wins. */
function inferFromValues(values: unknown[], key: string): SchemaField {
  const present = values.filter((v) => v !== null && v !== undefined);
  const nullable = present.length < values.length;
  if (present.length === 0) return { key, type: 'null', nullable: true, sample: values[0] };
  const first = present[0];
  if (Array.isArray(first)) {
    const items = present.filter(Array.isArray).flatMap((a) => (a as unknown[]).slice(0, MAX_ITEMS)).slice(0, MAX_ITEMS);
    const itemsType: SchemaField = items.length > 0 ? inferFromValues(items, 'item') : { key: 'item', type: 'any' as const, nullable: true, sample: undefined };
    return {
      key,
      type: 'array',
      nullable,
      sample: first,
      items: { type: itemsType.type, nullable: itemsType.nullable, fields: itemsType.fields, sample: itemsType.sample },
    };
  }
  if (isPlainObject(first)) {
    const objects = present.filter(isPlainObject);
    const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))];
    const fields = keys.map((k) => inferFromValues(objects.map((o) => (k in o ? o[k] : undefined)), k));
    return { key, type: 'object', nullable, sample: first, fields };
  }
  if (typeof first === 'string') return { key, type: 'string', nullable, sample: first };
  if (typeof first === 'number') return { key, type: 'number', nullable, sample: first };
  if (typeof first === 'boolean') return { key, type: 'boolean', nullable, sample: first };
  return { key, type: 'any', nullable, sample: first };
}

export function inferSchema(responseBody: unknown): InferredSchema {
  if (Array.isArray(responseBody)) {
    const items = responseBody.length > 0 ? inferFromValues(responseBody.slice(0, MAX_ITEMS), 'item') : null;
    return {
      type: 'array',
      items: items ? { type: items.type, nullable: items.nullable, fields: items.fields, sample: items.sample } : { type: 'any', nullable: true, sample: undefined },
    };
  }
  if (isPlainObject(responseBody)) {
    const fields = Object.entries(responseBody).map(([k, v]) => inferFromValues([v], k));
    return { type: 'object', fields };
  }
  return { type: 'object', fields: [] };
}
