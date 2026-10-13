-- An API client has one way in: `key` (a static key held by a server) or `jwt` (a token of the organisation's identity provider).
-- A key must never be carried by a browser or an app, so the old `public` kind is retired: such a client is suspended (its key is, by
-- definition, in a place anyone can read) and becomes a `key` client that an administrator has to review. Expand-only: the `kind`
-- column stays, unused.
ALTER TABLE "api_clients" ADD COLUMN IF NOT EXISTS "auth_mode" text DEFAULT 'key' NOT NULL;
UPDATE "api_clients" SET "status" = 'suspended' WHERE "kind" = 'public';
UPDATE "api_clients" SET "kind" = 'server' WHERE "kind" = 'public';
