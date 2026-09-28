CREATE TABLE IF NOT EXISTS gateway_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES gateway_endpoints(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES gateway_routes(id) ON DELETE CASCADE,
  website_id uuid NOT NULL,
  kind text NOT NULL,
  field_path text,
  param_keys text[] NOT NULL DEFAULT '{}',
  filters jsonb,
  config_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gateway_binding_config_hash_idx ON gateway_bindings(website_id, config_hash);
