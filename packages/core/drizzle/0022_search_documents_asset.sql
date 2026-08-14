-- Search v1.1: index DAM assets alongside pages/objects/classes.
-- The 0021 table/columns/indexes are reused as-is (asset rows fit the
-- existing (document_type, document_id, locale) unique constraint and the
-- GIN/trgm indexes - extraction flattens the asset's jsonb metadata into
-- the text columns before insert). Only the document_type CHECK widens.
ALTER TABLE "search_documents"
  DROP CONSTRAINT "search_documents_document_type_check",
  ADD CONSTRAINT "search_documents_document_type_check"
    CHECK ("document_type" IN ('page', 'object', 'class', 'asset'));