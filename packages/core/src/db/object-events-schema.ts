import { pgTable, text, jsonb, uuid, timestamp, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { gatewayEndpoints, gatewayRoutes } from './gateway-schema.js';

// Object events: a transactional outbox (docs/plans/datamodel/data-objects-automations.md, section 6; object-events-phase0.md, step 2).
// An event row is written in the same transaction as the data change; one delivery row per matching subscription is written with it,
// so a subscription created later never receives old events and the worker never has to match.

export const objectEvents = pgTable('object_events', {
  /** The event id sent to the consumer: its idempotency key. */
  id: uuid('id').primaryKey(),
  type: text('type').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  /** No foreign keys to the class or the object: the event outlives both (an `object.deleted` is about a row that is gone). */
  classId: uuid('class_id'),
  /** 'object' | 'asset' | 'page': what `object_id` is the id of (an asset or a page has no class: `class_id` is then null) */
  subjectType: text('subject_type').notNull().default('object'),
  objectId: uuid('object_id'),
  translationGroupId: uuid('translation_group_id'),
  locale: text('locale'),
  /** 'user' | 'api-client' | 'system' | 'import' */
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  /** The whole envelope (names and ids, never attribute values). */
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  createdIdx: index('object_events_created_idx').on(t.createdAt),
  objectIdx: index('object_events_object_idx').on(t.objectId),
}));

export const objectEventSubscriptions = pgTable('object_event_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  /** One class, or null for every class. */
  classId: uuid('class_id'),
  /** Event types, e.g. {'object.created','object.transitioned'}. */
  events: text('events').array().notNull(),
  /** The Gateway endpoint and route to call. Null after either is deleted: the delivery then ends `dead` with a clear error. */
  endpointId: uuid('endpoint_id').references(() => gatewayEndpoints.id, { onDelete: 'set null' }),
  routeId: uuid('route_id').references(() => gatewayRoutes.id, { onDelete: 'set null' }),
  /** 'minimal' (ids, state, changed) | 'fields' (plus an allow-list of attribute names, phase 2). */
  payloadMode: text('payload_mode').notNull().default('minimal'),
  fields: text('fields').array().notNull().default([]),
  /** Actor ids whose writes never start this subscription (the engine's own API client: loop guard). */
  ignoreActors: text('ignore_actors').array().notNull().default([]),
  /** Reference to the HMAC key, never the key. */
  signingSecretRef: text('signing_secret_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameIdx: uniqueIndex('object_event_sub_name_idx').on(t.name),
}));

export const objectEventDeliveries = pgTable('object_event_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => objectEvents.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').notNull().references(() => objectEventSubscriptions.id, { onDelete: 'cascade' }),
  /** 'pending' | 'delivered' | 'retrying' | 'dead' */
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  /** Status and a truncated error text only; the consumer's answer body is never stored. */
  lastError: text('last_error'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dueIdx: index('object_event_delivery_due_idx').on(t.status, t.nextAttemptAt),
  oncePerSubIdx: uniqueIndex('object_event_delivery_once_idx').on(t.eventId, t.subscriptionId),
}));
