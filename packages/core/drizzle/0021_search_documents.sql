-- Search engine: denormalized full-text index over pages and class data.
-- See docs/plans/search-engine/search-engine-plan.md. Hand-written SQL
-- (not drizzle-kit generated) because tsvector columns and GIN/trigram
-- indexes have no drizzle table-type equivalent; the table is modeled in
-- search-documents-schema.ts for the columns drizzle needs (the
-- generated tsvector column is deliberately omitted there - queries reach
-- it through raw sql fragments).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- to_tsvector() and array_to_string() are STABLE (not IMMUTABLE) in
-- Postgres < 13 / by conservative marking, which would reject them in a
-- GENERATED ALWAYS expression - wrap both in IMMUTABLE functions pinned to
-- the 'simple' config (the standard pattern for this).
CREATE OR REPLACE FUNCTION immutable_tsvector(text) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT to_tsvector('simple', $1) $$;

CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT array_to_string($1, $2) $$;

CREATE TABLE "search_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_type" text NOT NULL CHECK ("document_type" IN ('page','object','class')),
  "document_id" uuid NOT NULL,
  "locale" text NOT NULL DEFAULT 'en',
  "website_id" uuid,
  "published" boolean NOT NULL DEFAULT false,
  "published_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "title" text NOT NULL DEFAULT '',
  "path" text NOT NULL DEFAULT '',
  "category" text NOT NULL DEFAULT '',
  "keywords" text[] NOT NULL DEFAULT '{}',
  "body" text NOT NULL DEFAULT '',
  "excerpt" text NOT NULL DEFAULT '',
  "document_tsvector" tsvector GENERATED ALWAYS AS (
    setweight(immutable_tsvector(coalesce("title",'')), 'A') ||
    setweight(immutable_tsvector(coalesce("category",'') || ' ' || immutable_array_to_string("keywords",' ')), 'B') ||
    setweight(immutable_tsvector(coalesce("excerpt",'')), 'B') ||
    setweight(immutable_tsvector(coalesce("body",'')), 'C')
  ) STORED,
  "payload" jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT "search_documents_unique" UNIQUE ("document_type", "document_id", "locale")
);

CREATE INDEX "search_documents_tsv_gin" ON "search_documents" USING gin ("document_tsvector");
CREATE INDEX "search_documents_title_trgm" ON "search_documents" USING gin ("title" gin_trgm_ops);
CREATE INDEX "search_documents_path_trgm" ON "search_documents" USING gin ("path" gin_trgm_ops);
CREATE INDEX "search_documents_scope" ON "search_documents" ("website_id", "locale", "published");
CREATE INDEX "search_documents_updated" ON "search_documents" ("updated_at" DESC);