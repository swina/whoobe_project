-- Where a person lands after a single sign-on: the dashboard, which in development is not the address core-api answers on.
-- NULL = the same address as the redirect base (production behind one proxy).
ALTER TABLE "oidc_settings" ADD COLUMN IF NOT EXISTS "dashboard_url" text;
