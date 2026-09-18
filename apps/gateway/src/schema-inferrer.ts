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

function inferValueType(value: unknown, key: string): SchemaField {
  if (value === null || value === undefined) {
    return { key, type: 'null', nullable: true, sample: value };
  }
  if (Array.isArray(value)) {
    const itemsType: SchemaField = value.length > 0 ? inferValueType(value[0], 'item') : { key: 'item', type: 'any' as const, nullable: true, sample: undefined };
    return {
      key,
      type: 'array',
      nullable: false,
      sample: value,
      items: { type: itemsType.type, nullable: itemsType.nullable, fields: itemsType.fields, sample: itemsType.sample },
    };
  }
  if (typeof value === 'object' && value !== null) {
    const fields = Object.entries(value as Record<string, unknown>).map(([k, v]) => inferValueType(v, k));
    return { key, type: 'object', nullable: false, sample: value, fields };
  }
  if (typeof value === 'string') return { key, type: 'string', nullable: false, sample: value };
  if (typeof value === 'number') return { key, type: 'number', nullable: false, sample: value };
  if (typeof value === 'boolean') return { key, type: 'boolean', nullable: false, sample: value };
  return { key, type: 'any', nullable: false, sample: value };
}

export function inferSchema(responseBody: unknown): InferredSchema {
  if (Array.isArray(responseBody)) {
    const firstItem = responseBody.length > 0 ? inferValueType(responseBody[0], 'item') : null;
    return {
      type: 'array',
      items: firstItem ? { type: firstItem.type, nullable: firstItem.nullable, fields: firstItem.fields, sample: firstItem.sample } : { type: 'any', nullable: true, sample: undefined },
    };
  }
  if (typeof responseBody === 'object' && responseBody !== null) {
    const fields = Object.entries(responseBody as Record<string, unknown>).map(([k, v]) => inferValueType(v, k));
    return { type: 'object', fields };
  }
  return { type: 'object', fields: [] };
}