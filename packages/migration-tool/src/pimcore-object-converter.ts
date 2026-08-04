import type { ClassFieldDefinition } from '@pimcore-custom/core';
import type { RawPimcoreObjectAttributes } from './source-adapter.js';

/** Resolves a Pimcore asset id to its real, current path - same role
 * `PimcoreSourceAdapter.resolveAssetPath` already plays for Document
 * editables (pimcore-document-converter.ts), reused here rather than
 * inventing a second asset-resolution concept. */
export type AssetPathResolver = (assetId: number) => Promise<string | null>;

/**
 * Resolves a relation's Pimcore target (a class *name* + that class's own
 * raw Pimcore object id) to the already-migrated `data_objects.id`
 * (a real internal uuid) - or `null` if that target hasn't been migrated
 * yet. Deliberately a callback, not something this converter looks up
 * itself - the converter stays free of `@pimcore-custom/core`/DB imports,
 * the same package-boundary discipline `pimcore-page-converter.ts`
 * already established for `Element`. `cli.ts` supplies the real
 * implementation (a `data_objects` lookup by `pimcoreId`).
 *
 * A `null` result is real and expected, not an error: relation targets
 * are often migrated in a separate CLI run, in a different class order -
 * see docs/plans/datamodel/advanced-data-modeling-plan.md §9 on why
 * migration order matters here. Unresolved relations are stored as
 * `{ id: null, pimcoreId }` rather than dropped, so a later re-run (once
 * the target exists) can be reconciled without re-deriving anything.
 *
 * Takes the *current locale* being converted too - a real Phase 4 finding
 * (round-trip-testing the pilot's own migrated data, not assumed):
 * `data_objects.pimcoreId` is one row per locale (§4.4), so a bare raw
 * Pimcore id is not by itself a unique lookup key on our side - the
 * resolver needs to know which locale's sibling row it's pointing a
 * relation at.
 */
export type ObjectRelationResolver = (targetClassName: string, pimcoreId: string, locale: string) => Promise<string | null>;

export interface PimcoreObjectConverterOptions {
  resolveAssetPath: AssetPathResolver;
  resolveRelation: ObjectRelationResolver;
}

async function resolveObjectRelationValue(
  targetClassName: string | undefined,
  pimcoreId: string,
  locale: string,
  resolveRelation: ObjectRelationResolver
): Promise<{ id: string } | { id: null; pimcoreId: string }> {
  if (!targetClassName) return { id: null, pimcoreId };
  const id = await resolveRelation(targetClassName, pimcoreId, locale);
  return id ? { id } : { id: null, pimcoreId };
}

async function convertFieldValue(
  field: ClassFieldDefinition,
  raw: RawPimcoreObjectAttributes,
  locale: string,
  options: PimcoreObjectConverterOptions
): Promise<unknown> {
  const rawValue = field.localized ? raw.localizedByLocale[locale]?.[field.name] : raw.columns[field.name];

  switch (field.fieldType) {
    case 'input':
    case 'textarea':
    case 'wysiwyg':
    case 'urlSlug':
    case 'country':
    case 'email':
      return rawValue == null ? null : String(rawValue);

    case 'numeric':
      return rawValue == null ? null : Number(rawValue);

    case 'checkbox':
      return rawValue == null ? null : Boolean(Number(rawValue));

    case 'date': {
      const seconds = Number(rawValue);
      return Number.isFinite(seconds) && rawValue != null ? new Date(seconds * 1000).toISOString() : null;
    }

    // A "select" whose real data source is an object-listing options
    // provider (§3.1/§4.3) stores the target's raw Pimcore id as a plain
    // string in this same column - a plain fixed-choice select (no
    // relationTarget) just passes the chosen string through.
    case 'select':
      if (rawValue == null) return null;
      if (field.relationTarget) return resolveObjectRelationValue(field.relationTarget, String(rawValue), locale, options.resolveRelation);
      return String(rawValue);

    // A delimited-id-string in real Pimcore storage (confirmed: Product's
    // `tags`, e.g. ",1531,") - relation-flavored multiselects resolve
    // each id the same way a single relation-select does.
    case 'multiselect': {
      if (rawValue == null) return [];
      const ids = String(rawValue)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!field.relationTarget) return ids;
      return Promise.all(ids.map((id) => resolveObjectRelationValue(field.relationTarget, id, locale, options.resolveRelation)));
    }

    case 'manyToOneRelation': {
      const relation = raw.relations.find((r) => r.fieldname === field.name);
      if (!relation) return null;
      if (relation.type === 'asset') {
        const path = await options.resolveAssetPath(relation.destId);
        return path ? { assetId: path } : null;
      }
      return resolveObjectRelationValue(field.relationTarget, String(relation.destId), locale, options.resolveRelation);
    }

    case 'manyToManyRelation':
    case 'manyToManyObjectRelation':
    case 'advancedManyToManyRelation': {
      const edges = raw.relations.filter((r) => r.fieldname === field.name);
      const values: unknown[] = [];
      for (const edge of edges) {
        if (edge.type === 'asset') {
          const path = await options.resolveAssetPath(edge.destId);
          if (path) values.push({ assetId: path });
        } else {
          values.push(await resolveObjectRelationValue(field.relationTarget, String(edge.destId), locale, options.resolveRelation));
        }
      }
      return values;
    }

    case 'video':
    case 'image': {
      // Both store a bare Pimcore asset id directly in their own column
      // (not an `object_relations_*` edge like manyToOneRelation/video
      // *can* also be, depending on Pimcore version) - real, confirmed
      // shape: a Product's real `image`/`header` columns hold a plain
      // integer, not a relation row.
      const relation = raw.relations.find((r) => r.fieldname === field.name);
      const assetId = relation ? relation.destId : Number(rawValue);
      if (!Number.isFinite(assetId)) return null;
      const path = await options.resolveAssetPath(assetId);
      return path ? { assetId: path } : null;
    }

    // Real Pimcore `link`/`block`/`fieldcollections` storage (PHP-
    // serialized column data for the first two, a separate
    // `object_collection_<Type>_<classId>` table for the third) needs its
    // own real parsing this pilot doesn't build - stated as an explicit
    // gap rather than faked, matching Phase 0/6's own decision that a
    // real Field Collection editor is separate, later work, and the
    // Pages pipeline's own precedent of a labeled placeholder over a
    // silent drop for anything genuinely out of scope.
    case 'link':
      return { path: null, text: null, target: null };
    case 'block':
    case 'fieldcollections':
      return [];

    default:
      return rawValue ?? null;
  }
}

export class PimcoreObjectConverter {
  /** Converts one raw Pimcore object into one `data_objects.attributes`
   * shape per locale it actually has localized data for (falling back to
   * a single `'en'` result for a class with no localized fields at all -
   * matching whoobe_pages' own "always at least one row" invariant). */
  public static async convertObject(
    raw: RawPimcoreObjectAttributes,
    fields: ClassFieldDefinition[],
    options: PimcoreObjectConverterOptions
  ): Promise<{ locale: string; attributes: Record<string, unknown> }[]> {
    const locales = Object.keys(raw.localizedByLocale);
    const localesToUse = locales.length > 0 ? locales : ['en'];

    const results: { locale: string; attributes: Record<string, unknown> }[] = [];
    for (const locale of localesToUse) {
      const attributes: Record<string, unknown> = {};
      for (const field of fields) {
        attributes[field.name] = await convertFieldValue(field, raw, locale, options);
      }
      results.push({ locale, attributes });
    }
    return results;
  }
}
