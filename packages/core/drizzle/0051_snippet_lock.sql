-- A snippet can be locked: a locked snippet is never saved automatically (the editor's autosave leaves it alone, and the
-- server refuses a save flagged as automatic). Manual saves are not affected. Expand-only: a new column with a default.
ALTER TABLE "whoobe_one_snippets" ADD COLUMN IF NOT EXISTS "locked" boolean NOT NULL DEFAULT false;
