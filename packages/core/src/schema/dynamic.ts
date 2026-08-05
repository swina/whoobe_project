import { z, ZodSchema } from 'zod';

/**
 * Real Pimcore field types found in the pimcore-demo install's actual
 * class definitions - see docs/plans/datamodel/advanced-data-modeling-
 * plan.md §4.3 for the full census/table this implements. `relationTarget`
 * (a class *name*, resolved to a class id by the caller - dynamic.ts has
 * no DB access of its own) drives both `select`-as-relation and every
 * relation-family fieldtype; `options` is for a plain fixed-choice
 * `select`/`multiselect`; `blockFields` is `block`'s own inline child
 * field list (recursively compiled, see compileFieldSchema below);
 * `collectionFields` is `fieldcollections`' single-shared-shape fallback
 * (Phase 2/3's own simplification, kept for backward compatibility);
 * `collectionTypes` is the real thing Phase 6 builds - a `fieldcollections`
 * field can hold an ordered mix of *several distinct named types* (e.g.
 * Product's real `content` field allows `ProductBanner`, `ProductTabs`,
 * `ProductVariants`, ... all mixed in one list, confirmed against real
 * migrated data), each with its own field list. When both are absent,
 * `fieldcollections` falls back to `z.record(z.unknown())` per item.
 */
export interface ClassFieldDefinition {
  name: string;
  title: string;
  fieldType: string;
  mandatory?: boolean;
  localized?: boolean;
  relationTarget?: string;
  options?: string[];
  blockFields?: ClassFieldDefinition[];
  collectionFields?: ClassFieldDefinition[];
  collectionTypes?: { name: string; label: string; fields: ClassFieldDefinition[] }[];
}

export interface ClassDefinition {
  id: string;
  name: string;
  fields: ClassFieldDefinition[];
}

/**
 * Optional per-class detail-form layout - docs/plans/datamodel/native-
 * class-authoring-plan.md §3.3 (Phase 3), reworked per docs/plans/UI/
 * editing-object-class.md. Nullable/absent by default so every class
 * keeps rendering with today's flat detail form until an admin explicitly
 * configures one - additive, not a replacement for the generic renderer.
 * `detailSections` groups fields (by `name`) into named tabs in
 * DataObjectForm.vue; any field not assigned to a section still renders,
 * under a trailing "Other fields" tab - never silently hidden.
 *
 * List-view column selection used to live here too (`listColumns`) - moved
 * out per editing-object-class.md's own explicit instruction ("available
 * from the list view and not in the settings"): ObjectsView.vue now owns
 * that as user-saved, named presets in browser localStorage
 * (object-list-presets.ts), not an admin-authored, server-stored field.
 */
export interface ClassViewConfig {
  detailSections?: { title: string; fields: string[] }[];
}

const RELATION_ID_SHAPE = z.object({ id: z.string(), classId: z.string().optional() });
const ASSET_REF_SHAPE = z.object({ assetId: z.string() });
const LINK_SHAPE = z.object({
  path: z.string().nullable(),
  text: z.string().nullable(),
  target: z.string().nullable(),
});

/**
 * Compiles one field's Zod validator - a plain function, not inlined in
 * compileDynamicSchema's loop, so `block`'s own child fields (and a
 * fieldcollection's own item fields) can recurse through the exact same
 * logic rather than duplicating the switch.
 */
function compileFieldSchema(field: ClassFieldDefinition): ZodSchema {
  let fieldSchema: ZodSchema;

  switch (field.fieldType) {
    case 'input':
    case 'textarea':
    case 'wysiwyg':
    case 'urlSlug':
    case 'country':
      fieldSchema = z.string();
      break;
    case 'email':
      fieldSchema = z.string().email();
      break;
    case 'numeric':
      fieldSchema = z.number();
      break;
    case 'checkbox':
      fieldSchema = z.boolean();
      break;
    case 'date':
      fieldSchema = z.coerce.date();
      break;
    case 'select':
      // A relation-flavored select (an object-listing data source, no
      // formal FK - see the plan's §3.2/§4.3) is distinguished by
      // `relationTarget` being set; a plain fixed-choice select uses
      // `options`; neither falls back to a bare string.
      if (field.relationTarget) {
        fieldSchema = RELATION_ID_SHAPE.nullable();
      } else if (field.options && field.options.length > 0) {
        fieldSchema = z.enum(field.options as [string, ...string[]]);
      } else {
        fieldSchema = z.string();
      }
      break;
    case 'multiselect':
      fieldSchema = z.array(z.string());
      break;
    case 'manyToOneRelation':
      // Pimcore's own manyToOneRelation can point at either a Data Object
      // or an Asset - `relationTarget` set means the former (a real
      // class name to resolve objects against); unset is treated as an
      // asset reference, matching this field's real use for
      // `technicalSheet` (Product) in the source data.
      fieldSchema = field.relationTarget ? RELATION_ID_SHAPE.nullable() : ASSET_REF_SHAPE.nullable();
      break;
    case 'manyToManyRelation':
    case 'manyToManyObjectRelation':
    case 'advancedManyToManyRelation':
      fieldSchema = z.array(RELATION_ID_SHAPE);
      break;
    case 'link':
      fieldSchema = LINK_SHAPE;
      break;
    case 'video':
      fieldSchema = ASSET_REF_SHAPE.nullable();
      break;
    case 'block':
      fieldSchema = z.array(compileFieldsShape(field.blockFields ?? []));
      break;
    case 'fieldcollections':
      if (field.collectionTypes && field.collectionTypes.length > 0) {
        // A real, tagged-union repeatable list - each item is one of
        // several distinct named collection types, discriminated by its
        // own `collectionType` string (§6, Phase 6 - not the Phase 2/3
        // single-shape simplification below).
        const itemSchemas = field.collectionTypes.map((type) =>
          z.object({ collectionType: z.literal(type.name), ...buildFieldsShapeRecord(type.fields) })
        );
        fieldSchema = z.array(
          itemSchemas.length > 1
            ? z.union(itemSchemas as unknown as [ZodSchema, ZodSchema, ...ZodSchema[]])
            : itemSchemas[0]
        );
      } else {
        // One shared shape, not per-collection-type - Phase 2/3's own
        // simplification, kept as a fallback for when full multi-type
        // info isn't available (e.g. a hand-authored class with no
        // migrated `collectionTypes`).
        fieldSchema = z.array(field.collectionFields ? compileFieldsShape(field.collectionFields) : z.record(z.unknown()));
      }
      break;
    default:
      // Covers the Newsletter-bundle-specific types (firstname/gender/
      // consent/etc., §4.3) deliberately left unhandled pending §3.3's
      // PII decision, and anything else genuinely unrecognized.
      fieldSchema = z.unknown();
  }

  return field.mandatory ? fieldSchema : fieldSchema.optional().nullable();
}

/** The plain `{ fieldName: ZodSchema }` record - exposed separately from
 * `compileFieldsShape` (which wraps it in `z.object(...)`) so the
 * `fieldcollections` tagged-union case can merge it with its own
 * `collectionType` literal key instead of re-deriving the shape. */
function buildFieldsShapeRecord(fields: ClassFieldDefinition[]): Record<string, ZodSchema> {
  const shape: Record<string, ZodSchema> = {};
  for (const field of fields) shape[field.name] = compileFieldSchema(field);
  return shape;
}

function compileFieldsShape(fields: ClassFieldDefinition[]): ZodSchema {
  return z.object(buildFieldsShapeRecord(fields));
}

/**
 * Dynamic Zod Schema Compiler
 * Converts JSON Class Definitions into Zod runtime validators.
 */
export function compileDynamicSchema(definition: ClassDefinition): ZodSchema {
  return compileFieldsShape(definition.fields);
}
