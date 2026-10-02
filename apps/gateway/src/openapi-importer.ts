import { dereference } from '@readme/openapi-parser';
import { safeFetch } from '@whoobe-cms/core/server';
import { load as loadYaml } from 'js-yaml';
import type { SchemaField, InferredSchema } from './schema-inferrer.js';

/** Loosely-typed - we only ever read a handful of well-known properties off
 *  an OpenAPI 2/3.0/3.1 Schema Object, and the exact union of official types
 *  (OpenAPIV2.SchemaObject | OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject)
 *  is more friction than value for a converter that just wants
 *  type/properties/items/nullable. */
type OpenApiSchema = Record<string, any>;

export interface ParsedOpenApiDoc {
  document: Record<string, any>;
}

export async function parseOpenApiSpec(input: { url?: string; raw?: string }): Promise<ParsedOpenApiDoc> {
  // The spec is fetched by us (safeFetch: SSRF policy, size/time caps) and parsed from text; the parser
  // is told NOT to resolve external $refs (it would otherwise fetch http(s):// URLs or read file://
  // paths named inside a spec, which is an SSRF / local file read primitive).
  const noExternalRefs = { resolve: { external: false } } as any;
  let text = input.raw;
  if (input.url) {
    const res = await safeFetch(input.url, { headers: { accept: 'application/json, application/yaml, text/yaml, */*' } }, { maxBytes: 10 * 1024 * 1024, timeoutMs: 20_000 });
    if (!res.ok) throw new Error(`Could not download the spec: HTTP ${res.status}`);
    text = await res.text();
  }
  if (text) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = loadYaml(text);
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(input.url ? 'The downloaded spec is not valid JSON or YAML' : 'Pasted spec is not valid JSON or YAML');
    }
    const document = await dereference(parsed as any, noExternalRefs);
    return { document: document as unknown as Record<string, any> };
  }
  throw new Error('Either a spec URL or raw spec text is required');
}

/** Converts an OpenAPI/Swagger Schema Object into the same InferredSchema/
 *  SchemaField shape schema-inferrer.ts produces from a live sample, so the
 *  rest of the system (GatewayBindingPicker's field walk, gateway_schemas
 *  storage) never needs to know whether a schema came from a real response
 *  or a spec. There's no sample value here (nothing was actually called),
 *  so `sample` is always left undefined. */
function openApiTypeToFieldType(schema: OpenApiSchema): SchemaField['type'] {
  const type = Array.isArray(schema?.type) ? schema.type.find((t: string) => t !== 'null') : schema?.type;
  switch (type) {
    case 'string': return 'string';
    case 'integer':
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'array': return 'array';
    case 'object': return 'object';
    default:
      // No explicit type but has properties -> treat as object (common in
      // loosely-written specs that omit `type: object`).
      if (schema?.properties) return 'object';
      if (schema?.items) return 'array';
      return 'any';
  }
}

function isNullableSchema(schema: OpenApiSchema): boolean {
  if (schema?.nullable === true) return true; // OpenAPI 3.0
  if (Array.isArray(schema?.type) && schema.type.includes('null')) return true; // OpenAPI 3.1
  return false;
}

export function openApiSchemaToInferredSchema(schema: OpenApiSchema | undefined | null): InferredSchema {
  if (!schema || typeof schema !== 'object') return { type: 'object', fields: [] };

  // A response/request body schema is often `{ type: 'array', items: {...} }`
  // at the top level - mirror schema-inferrer's own InferredSchema shape,
  // which special-cases a top-level array the same way.
  if (openApiTypeToFieldType(schema) === 'array') {
    const itemSchema = schema.items ?? {};
    const itemField = openApiSchemaToField('item', itemSchema);
    return {
      type: 'array',
      items: { type: itemField.type, nullable: itemField.nullable, fields: itemField.fields, sample: undefined },
    };
  }

  const properties: Record<string, OpenApiSchema> = schema.properties ?? {};
  const fields = Object.entries(properties).map(([key, propSchema]) => openApiSchemaToField(key, propSchema));
  return { type: 'object', fields };
}

function openApiSchemaToField(key: string, schema: OpenApiSchema): SchemaField {
  const type = openApiTypeToFieldType(schema);
  const nullable = isNullableSchema(schema);

  if (type === 'array') {
    const itemSchema = schema.items ?? {};
    const itemField = openApiSchemaToField('item', itemSchema);
    return {
      key,
      type: 'array',
      nullable,
      sample: undefined,
      items: { type: itemField.type, nullable: itemField.nullable, fields: itemField.fields, sample: undefined },
    };
  }

  if (type === 'object') {
    const properties: Record<string, OpenApiSchema> = schema.properties ?? {};
    const fields = Object.entries(properties).map(([k, v]) => openApiSchemaToField(k, v));
    return { key, type: 'object', nullable, sample: undefined, fields };
  }

  return { key, type, nullable, sample: undefined };
}

export interface ExtractedRoute {
  path: string;
  method: string;
  description: string;
  requestBodySchema?: Record<string, unknown>;
  responseSchema: InferredSchema;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** OpenAPI's `{param}` path templating already matches gateway_routes.path's
 *  existing convention (see resolve-handler.ts's resolveGatewayUrl), so
 *  paths are used as-is - no translation needed. */
export function extractRoutesFromSpec(doc: ParsedOpenApiDoc): ExtractedRoute[] {
  const paths = doc.document?.paths ?? {};
  const routes: ExtractedRoute[] = [];

  for (const [path, pathItem] of Object.entries<any>(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const responses = operation.responses ?? {};
      const preferredResponse = responses['200'] ?? responses['201'] ?? responses['default'];
      const responseSchema = extractResponseSchema(preferredResponse);

      const requestBodySchema = extractRequestBodySchema(operation, pathItem);

      routes.push({
        path,
        method: method.toUpperCase(),
        description: operation.summary || operation.description || '',
        requestBodySchema: requestBodySchema as Record<string, unknown> | undefined,
        responseSchema,
      });
    }
  }

  return routes;
}

function extractResponseSchema(response: any): InferredSchema {
  if (!response) return { type: 'object', fields: [] };
  // OpenAPI 3.x: response.content['application/json'].schema
  const jsonContent = response.content?.['application/json'] ?? response.content?.['application/json; charset=utf-8'];
  if (jsonContent?.schema) return openApiSchemaToInferredSchema(jsonContent.schema);
  // Swagger 2.0: response.schema directly
  if (response.schema) return openApiSchemaToInferredSchema(response.schema);
  return { type: 'object', fields: [] };
}

function extractRequestBodySchema(operation: any, pathItem: any): InferredSchema | undefined {
  // OpenAPI 3.x
  const jsonContent = operation.requestBody?.content?.['application/json'];
  if (jsonContent?.schema) return openApiSchemaToInferredSchema(jsonContent.schema);
  // Swagger 2.0: a `body`-in parameter, either on the operation or shared on the path item
  const bodyParam = [...(operation.parameters ?? []), ...(pathItem.parameters ?? [])].find((p: any) => p?.in === 'body');
  if (bodyParam?.schema) return openApiSchemaToInferredSchema(bodyParam.schema);
  return undefined;
}

export interface ImportOpenApiResult {
  created: number;
  updated: number;
  skipped: { path: string; method: string; reason: string }[];
}

/** Bulk-creates/updates gateway_routes + gateway_schemas rows from a parsed
 *  spec, matching existing routes by (endpointId, path, method) - the same
 *  identity the DB's unique index (gateway_endpoint_route_idx) already
 *  enforces - rather than relying on catching a constraint-violation error,
 *  so a partially-matching import degrades to a clean per-route skip/update
 *  decision instead of an aborted transaction. */
export async function importOpenApiToEndpoint(endpointId: string, doc: ParsedOpenApiDoc): Promise<ImportOpenApiResult> {
  const { listGatewayRoutes, createGatewayRoute, updateGatewayRoute, upsertGatewaySchema } = await import('@whoobe-cms/core/server');

  const routes = extractRoutesFromSpec(doc);
  const existingRoutes = await listGatewayRoutes(endpointId);
  const existingByKey = new Map(existingRoutes.map((r) => [`${r.path} ${r.method}`, r]));

  const result: ImportOpenApiResult = { created: 0, updated: 0, skipped: [] };

  for (const route of routes) {
    try {
      const key = `${route.path} ${route.method}`;
      const existing = existingByKey.get(key);

      const routeRecord = existing
        ? await updateGatewayRoute(existing.id, { description: route.description, requestBodySchema: route.requestBodySchema })
        : await createGatewayRoute({
            endpointId,
            path: route.path,
            method: route.method,
            description: route.description,
            requestBodySchema: route.requestBodySchema,
          });

      if (!routeRecord) {
        result.skipped.push({ path: route.path, method: route.method, reason: 'Route no longer exists' });
        continue;
      }

      const schemaRecord = await upsertGatewaySchema(routeRecord.id, route.responseSchema as unknown as Record<string, unknown>, null);
      if (!existing || routeRecord.responseSchemaId !== schemaRecord.id) {
        await updateGatewayRoute(routeRecord.id, { responseSchemaId: schemaRecord.id });
      }

      if (existing) result.updated += 1;
      else result.created += 1;
    } catch (err) {
      result.skipped.push({ path: route.path, method: route.method, reason: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return result;
}
