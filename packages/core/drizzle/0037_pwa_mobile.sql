ALTER TABLE websites ADD COLUMN pwa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE websites ADD COLUMN pwa_config jsonb DEFAULT '{}'::jsonb;

CREATE TABLE pwa_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id uuid NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'self',
  endpoint text NOT NULL,
  keys jsonb DEFAULT '{}'::jsonb,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX pwa_subscriptions_website_id_idx ON pwa_subscriptions(website_id);