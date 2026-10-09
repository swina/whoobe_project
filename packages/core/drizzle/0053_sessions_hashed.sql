-- Session ids are now stored as SHA-256 hashes of the cookie value (finding F-056): `sessions.id` keeps the same type (text), so
-- no schema change is needed. Rows written before this release hold the raw cookie value, which can no longer match anything;
-- remove them so that no live-looking token stays in the table or in later backups. Everyone logs in once more after the upgrade.
DELETE FROM "sessions";
