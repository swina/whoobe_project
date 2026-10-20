-- Kit templates need an id that is a string and unique inside their kit: the editor opens, loads, edits and removes a template by it.
-- The kits of the old editor have templates with the number 0 as id (several in one kit), so "edit" or "load" always met the first one.
-- Rewrites only the ids that are not a string or repeat an earlier one in the same kit (new id "tpl-" + 8 hex characters); every other
-- id, and everything else in a template, is left as it is. Kits whose ids are already fine are not touched (updated_at included).
UPDATE "whoobe_one_kits" k
SET "templates" = fixed.templates
FROM (
  SELECT numbered.kit_id,
         jsonb_agg(
           CASE WHEN jsonb_typeof(numbered.t -> 'id') <> 'string' OR numbered.rn > 1
                THEN jsonb_set(numbered.t, '{id}', to_jsonb('tpl-' || substr(md5(random()::text || numbered.ord::text || numbered.kit_id::text), 1, 8)))
                ELSE numbered.t END
           ORDER BY numbered.ord) AS templates
  FROM (
    SELECT kit.id AS kit_id, x.t, x.ord,
           row_number() OVER (PARTITION BY kit.id, (x.t ->> 'id') ORDER BY x.ord) AS rn
    FROM "whoobe_one_kits" kit, jsonb_array_elements(kit.templates) WITH ORDINALITY AS x(t, ord)
  ) numbered
  GROUP BY numbered.kit_id
  HAVING bool_or(jsonb_typeof(numbered.t -> 'id') <> 'string' OR numbered.rn > 1)
) fixed
WHERE k.id = fixed.kit_id;
