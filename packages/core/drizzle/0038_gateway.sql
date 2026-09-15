CREATE TABLE IF NOT EXISTS gateway_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  base_url text NOT NULL,
  auth_type text NOT NULL DEFAULT 'none',
  auth_config jsonb DEFAULT '{}'::jsonb,
  request_timeout_ms integer NOT NULL DEFAULT 30000,
  rate_limit_rps integer NOT NULL DEFAULT 0,
  rate_limit_burst integer NOT NULL DEFAULT 0,
  required_permission text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gateway_endpoint_name_idx ON gateway_endpoints(name);

CREATE TABLE IF NOT EXISTS gateway_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES gateway_endpoints(id) ON DELETE CASCADE,
  path text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  description text NOT NULL DEFAULT '',
  request_body_schema jsonb,
  response_schema_id uuid,
  plugin_chain text[] NOT NULL DEFAULT '{}',
  auto_update_schema boolean NOT NULL DEFAULT false,
  cache_ttl_seconds integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gateway_endpoint_route_idx ON gateway_routes(endpoint_id, path, method);

CREATE TABLE IF NOT EXISTS gateway_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES gateway_routes(id) ON DELETE CASCADE,
  schema jsonb NOT NULL,
  sample_payload jsonb,
  inferred_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gateway_schema_route_idx ON gateway_schemas(route_id);