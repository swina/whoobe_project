-- Object events: a transactional outbox (docs/plans/datamodel/data-objects-automations.md). Expand-only: three new tables.
CREATE TABLE IF NOT EXISTS "object_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "class_id" uuid NOT NULL,
  "object_id" uuid,
  "translation_group_id" uuid,
  "locale" text,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "object_events_created_idx" ON "object_events" ("created_at");
CREATE INDEX IF NOT EXISTS "object_events_object_idx" ON "object_events" ("object_id");
CREATE TABLE IF NOT EXISTS "object_event_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "class_id" uuid,
  "events" text[] NOT NULL,
  "endpoint_id" uuid REFERENCES "gateway_endpoints"("id") ON DELETE SET NULL,
  "route_id" uuid REFERENCES "gateway_routes"("id") ON DELETE SET NULL,
  "payload_mode" text DEFAULT 'minimal' NOT NULL,
  "fields" text[] DEFAULT '{}' NOT NULL,
  "ignore_actors" text[] DEFAULT '{}' NOT NULL,
  "signing_secret_ref" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "object_event_sub_name_idx" ON "object_event_subscriptions" ("name");
CREATE TABLE IF NOT EXISTS "object_event_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "object_events"("id") ON DELETE CASCADE,
  "subscription_id" uuid NOT NULL REFERENCES "object_event_subscriptions"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" text,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "object_event_delivery_due_idx" ON "object_event_deliveries" ("status", "next_attempt_at");
CREATE UNIQUE INDEX IF NOT EXISTS "object_event_delivery_once_idx" ON "object_event_deliveries" ("event_id", "subscription_id");
