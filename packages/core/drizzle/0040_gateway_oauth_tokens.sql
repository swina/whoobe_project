-- OAuth2 access-token cache for gateway_endpoints with authType='oauth2'
-- (client-credentials grant). Kept separate from auth_config_encrypted (the
-- user-entered client id/secret/token URL) because this is server-managed,
-- frequently-rewritten state - refreshed on expiry, not on endpoint edit -
-- and mixing the two in one ciphertext would race a concurrent config edit
-- against an in-flight token refresh.
ALTER TABLE gateway_endpoints ADD COLUMN IF NOT EXISTS oauth_token_encrypted text;
ALTER TABLE gateway_endpoints ADD COLUMN IF NOT EXISTS oauth_token_expires_at timestamptz;
