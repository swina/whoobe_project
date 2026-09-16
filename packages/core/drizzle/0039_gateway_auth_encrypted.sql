-- Adds the encrypted-at-rest column for gateway_endpoints credentials
-- (packages/core/src/db/gateway-auth-crypto.ts). Additive only - the old
-- plaintext `auth_config` column is left in place until every environment
-- has run the backfill script (packages/core/src/db/scripts/backfill-
-- gateway-auth-encryption.ts) and it's confirmed empty; a later migration
-- drops it.
ALTER TABLE gateway_endpoints ADD COLUMN IF NOT EXISTS auth_config_encrypted text;
