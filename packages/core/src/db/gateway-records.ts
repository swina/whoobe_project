import { getDb } from './client.js';
import { gatewayEndpoints, gatewayRoutes, gatewaySchemas, gatewayBindings } from './gateway-schema.js';
import { eq, and } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { encryptGatewayAuthConfig, decryptGatewayAuthConfig, encryptGatewayOAuthToken, decryptGatewayOAuthToken } from './gateway-auth-crypto.js';

// --- Endpoints ---

type GatewayEndpointRow = typeof gatewayEndpoints.$inferSelect;
type GatewayEndpointRowInput = typeof gatewayEndpoints.$inferInsert;

// The public shape every caller outside this file works with: `authConfig`
// is always the plaintext object, decrypted on read. `authConfigEncrypted`
// (and the deprecated plaintext `authConfig` DB column - see gateway-
// schema.ts) never leave this module. The OAuth2 token cache
// (oauthTokenEncrypted/oauthTokenExpiresAt) is deliberately excluded too -
// unlike authConfig, it has no plaintext counterpart on this type at all,
// so there's nothing for a route handler to accidentally forward to a
// client; use getGatewayEndpointOAuthToken/setGatewayEndpointOAuthToken.
export type GatewayEndpointRecord = Omit<GatewayEndpointRow, 'authConfigEncrypted' | 'oauthTokenEncrypted' | 'oauthTokenExpiresAt'>;
export type GatewayEndpointInput = Omit<GatewayEndpointRowInput, 'authConfigEncrypted' | 'oauthTokenEncrypted' | 'oauthTokenExpiresAt'>;

function toRecord(row: GatewayEndpointRow): GatewayEndpointRecord {
  const { authConfigEncrypted, authConfig, oauthTokenEncrypted, oauthTokenExpiresAt, ...rest } = row;
  return {
    ...rest,
    // A row already backfilled (see scripts/backfill-gateway-auth-
    // encryption.ts) has authConfigEncrypted set and authConfig cleared to
    // {}; a row written before 0039_gateway_auth_encrypted.sql still only
    // has the plaintext column, so fall back to it.
    authConfig: authConfigEncrypted ? decryptGatewayAuthConfig(authConfigEncrypted) : (authConfig ?? {}),
  };
}

function toRow<T extends { authConfig?: Record<string, unknown> | null }>(
  input: T
): Omit<T, 'authConfig'> & { authConfig?: Record<string, unknown>; authConfigEncrypted?: string | null } {
  const { authConfig, ...rest } = input;
  if (authConfig === undefined) return rest;
  // Every write goes out encrypted, and clears the legacy plaintext column
  // so a row never accumulates fresh plaintext once it's been touched here.
  return { ...rest, authConfig: {}, authConfigEncrypted: encryptGatewayAuthConfig(authConfig) };
}

export async function listGatewayEndpoints(): Promise<GatewayEndpointRecord[]> {
  const db = getDb();
  const rows = await db.select().from(gatewayEndpoints).orderBy(gatewayEndpoints.name);
  return rows.map(toRecord);
}

export async function getGatewayEndpoint(id: string): Promise<GatewayEndpointRecord | undefined> {
  const db = getDb();
  const rows = await db.select().from(gatewayEndpoints).where(eq(gatewayEndpoints.id, id)).limit(1);
  return rows[0] ? toRecord(rows[0]) : undefined;
}

export async function getGatewayEndpointByName(name: string): Promise<GatewayEndpointRecord | undefined> {
  const db = getDb();
  const rows = await db.select().from(gatewayEndpoints).where(eq(gatewayEndpoints.name, name)).limit(1);
  return rows[0] ? toRecord(rows[0]) : undefined;
}

export async function createGatewayEndpoint(input: GatewayEndpointInput): Promise<GatewayEndpointRecord> {
  const db = getDb();
  const rows = await db.insert(gatewayEndpoints).values(toRow(input) as GatewayEndpointRowInput).returning();
  return toRecord(rows[0]);
}

export async function updateGatewayEndpoint(id: string, input: Partial<GatewayEndpointInput>): Promise<GatewayEndpointRecord | undefined> {
  const db = getDb();
  const rows = await db.update(gatewayEndpoints).set({ ...toRow(input), updatedAt: new Date() }).where(eq(gatewayEndpoints.id, id)).returning();
  return rows[0] ? toRecord(rows[0]) : undefined;
}

export async function deleteGatewayEndpoint(id: string): Promise<void> {
  const db = getDb();
  await db.delete(gatewayEndpoints).where(eq(gatewayEndpoints.id, id));
}

/** Reads the cached OAuth2 access token for an endpoint (authType='oauth2'),
 *  decrypted, or null if none is cached yet. Deliberately separate from
 *  getGatewayEndpoint/GatewayEndpointRecord - see the comment on that type. */
export async function getGatewayEndpointOAuthToken(id: string): Promise<{ token: string; expiresAt: Date } | null> {
  const db = getDb();
  const rows = await db
    .select({ oauthTokenEncrypted: gatewayEndpoints.oauthTokenEncrypted, oauthTokenExpiresAt: gatewayEndpoints.oauthTokenExpiresAt })
    .from(gatewayEndpoints)
    .where(eq(gatewayEndpoints.id, id))
    .limit(1);
  const row = rows[0];
  if (!row?.oauthTokenEncrypted || !row.oauthTokenExpiresAt) return null;
  const token = decryptGatewayOAuthToken(row.oauthTokenEncrypted);
  if (!token) return null;
  return { token, expiresAt: row.oauthTokenExpiresAt };
}

/** Persists a freshly-fetched OAuth2 access token, encrypted. Called by
 *  gateway-auth-headers.ts's refreshOAuthToken after a successful
 *  client-credentials request. */
export async function setGatewayEndpointOAuthToken(id: string, token: string, expiresAt: Date): Promise<void> {
  const db = getDb();
  await db
    .update(gatewayEndpoints)
    .set({ oauthTokenEncrypted: encryptGatewayOAuthToken(token), oauthTokenExpiresAt: expiresAt })
    .where(eq(gatewayEndpoints.id, id));
}

// --- Routes ---

export type GatewayRouteRecord = typeof gatewayRoutes.$inferSelect;
export type GatewayRouteInput = typeof gatewayRoutes.$inferInsert;

export async function listGatewayRoutes(endpointId: string): Promise<GatewayRouteRecord[]> {
  const db = getDb();
  return db.select().from(gatewayRoutes).where(eq(gatewayRoutes.endpointId, endpointId)).orderBy(gatewayRoutes.path);
}

export async function getGatewayRoute(id: string): Promise<GatewayRouteRecord | undefined> {
  const db = getDb();
  const rows = await db.select().from(gatewayRoutes).where(eq(gatewayRoutes.id, id)).limit(1);
  return rows[0];
}

export async function createGatewayRoute(input: GatewayRouteInput): Promise<GatewayRouteRecord> {
  const db = getDb();
  const rows = await db.insert(gatewayRoutes).values(input).returning();
  return rows[0];
}

export async function updateGatewayRoute(id: string, input: Partial<GatewayRouteInput>): Promise<GatewayRouteRecord | undefined> {
  const db = getDb();
  const rows = await db.update(gatewayRoutes).set({ ...input, updatedAt: new Date() }).where(eq(gatewayRoutes.id, id)).returning();
  return rows[0];
}

export async function deleteGatewayRoute(id: string): Promise<void> {
  const db = getDb();
  await db.delete(gatewayRoutes).where(eq(gatewayRoutes.id, id));
}

// --- Schemas ---

export type GatewaySchemaRecord = typeof gatewaySchemas.$inferSelect;

export async function getGatewaySchema(routeId: string): Promise<GatewaySchemaRecord | undefined> {
  const db = getDb();
  const rows = await db.select().from(gatewaySchemas).where(eq(gatewaySchemas.routeId, routeId)).limit(1);
  return rows[0];
}

export async function upsertGatewaySchema(routeId: string, schema: Record<string, unknown>, samplePayload: unknown): Promise<GatewaySchemaRecord> {
  const db = getDb();
  const existing = await getGatewaySchema(routeId);
  if (existing) {
    const rows = await db.update(gatewaySchemas)
      .set({ schema, samplePayload, updatedAt: new Date() })
      .where(eq(gatewaySchemas.routeId, routeId))
      .returning();
    return rows[0];
  }
  const rows = await db.insert(gatewaySchemas).values({ routeId, schema, samplePayload }).returning();
  return rows[0];
}

export async function deleteGatewaySchema(routeId: string): Promise<void> {
  const db = getDb();
  await db.delete(gatewaySchemas).where(eq(gatewaySchemas.routeId, routeId));
}

// --- Bindings ---
// A page-save-time-created pin from an authored Form/gatewayBinding to one
// fixed (endpointId, routeId) - see docs/plans/api-gateway/gateway-auth-
// authz.md. Published site content only ever carries this row's opaque
// `id`, never the raw endpointName/routePath.

export type GatewayBindingRecord = typeof gatewayBindings.$inferSelect;
export type GatewayBindingKind = 'resolve' | 'submit';

export interface GatewayBindingInput {
  endpointId: string;
  routeId: string;
  websiteId: string;
  kind: GatewayBindingKind;
  fieldPath?: string | null;
  paramKeys?: string[];
  filters?: unknown;
}

function computeConfigHash(input: GatewayBindingInput): string {
  const canonical = JSON.stringify({
    endpointId: input.endpointId,
    routeId: input.routeId,
    kind: input.kind,
    fieldPath: input.fieldPath ?? null,
    paramKeys: [...(input.paramKeys ?? [])].sort(),
    filters: input.filters ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export async function getGatewayBindingById(id: string): Promise<GatewayBindingRecord | undefined> {
  const db = getDb();
  const rows = await db.select().from(gatewayBindings).where(eq(gatewayBindings.id, id)).limit(1);
  return rows[0];
}

/** Creates (or reuses, if this exact config was already saved for this
 *  website) the binding row for one authored Form/gatewayBinding. Throws if
 *  the referenced route's method doesn't match `kind` (a 'resolve' binding
 *  must target a GET route; a 'submit' binding must target a non-GET one) -
 *  this is the enforcement point, never trusted from the caller alone. */
export async function findOrCreateGatewayBinding(input: GatewayBindingInput): Promise<GatewayBindingRecord> {
  const db = getDb();
  const route = await getGatewayRoute(input.routeId);
  if (!route || route.endpointId !== input.endpointId) {
    throw new Error(`Gateway route '${input.routeId}' not found on endpoint '${input.endpointId}'`);
  }
  const isGet = route.method.toUpperCase() === 'GET';
  if (input.kind === 'resolve' && !isGet) {
    throw new Error(`Gateway binding kind 'resolve' requires a GET route (route '${route.path}' is ${route.method})`);
  }
  if (input.kind === 'submit' && isGet) {
    throw new Error(`Gateway binding kind 'submit' requires a non-GET route (route '${route.path}' is GET)`);
  }

  const configHash = computeConfigHash(input);
  const existing = await db
    .select()
    .from(gatewayBindings)
    .where(and(eq(gatewayBindings.websiteId, input.websiteId), eq(gatewayBindings.configHash, configHash)))
    .limit(1);
  if (existing[0]) return existing[0];

  const rows = await db
    .insert(gatewayBindings)
    .values({
      endpointId: input.endpointId,
      routeId: input.routeId,
      websiteId: input.websiteId,
      kind: input.kind,
      fieldPath: input.fieldPath ?? null,
      paramKeys: input.paramKeys ?? [],
      filters: input.filters ?? null,
      configHash,
    })
    // Two concurrent saves computing the same hash race the unique index -
    // the loser reuses the winner's row instead of erroring.
    .onConflictDoNothing({ target: [gatewayBindings.websiteId, gatewayBindings.configHash] })
    .returning();
  if (rows[0]) return rows[0];

  const winner = await db
    .select()
    .from(gatewayBindings)
    .where(and(eq(gatewayBindings.websiteId, input.websiteId), eq(gatewayBindings.configHash, configHash)))
    .limit(1);
  return winner[0];
}