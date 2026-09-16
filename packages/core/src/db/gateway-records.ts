import { getDb } from './client.js';
import { gatewayEndpoints, gatewayRoutes, gatewaySchemas } from './gateway-schema.js';
import { eq } from 'drizzle-orm';
import { encryptGatewayAuthConfig, decryptGatewayAuthConfig } from './gateway-auth-crypto.js';

// --- Endpoints ---

type GatewayEndpointRow = typeof gatewayEndpoints.$inferSelect;
type GatewayEndpointRowInput = typeof gatewayEndpoints.$inferInsert;

// The public shape every caller outside this file works with: `authConfig`
// is always the plaintext object, decrypted on read. `authConfigEncrypted`
// (and the deprecated plaintext `authConfig` DB column - see gateway-
// schema.ts) never leave this module.
export type GatewayEndpointRecord = Omit<GatewayEndpointRow, 'authConfigEncrypted'>;
export type GatewayEndpointInput = Omit<GatewayEndpointRowInput, 'authConfigEncrypted'>;

function toRecord(row: GatewayEndpointRow): GatewayEndpointRecord {
  const { authConfigEncrypted, authConfig, ...rest } = row;
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