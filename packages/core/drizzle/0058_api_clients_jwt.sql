-- Registration of an identity provider for clients that authenticate with its tokens (auth_mode = 'jwt'). Expand-only: a nullable column.
ALTER TABLE "api_clients" ADD COLUMN IF NOT EXISTS "jwt_config" jsonb;
