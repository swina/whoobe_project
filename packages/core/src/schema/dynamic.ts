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
 * `collectionFields` is `fieldcollections`' equivalent - deliberately a
 * single shared shape here, not per-collection-type, matching Phase 2's
 * scope (a real multi-collection-type picker is Phase 6's job, see the
 * plan's own phase list).
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
}

export interface ClassDefinition {
  id: string;
  name: string;
  fields: ClassFieldDefinition[];
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
      // One shared shape, not per-collection-type - see this file's own
      // header comment and the plan's §6.5/Phase 6 for why a real
      // multi-type picker is deliberately deferred, not built here.
      fieldSchema = z.array(field.collectionFields ? compileFieldsShape(field.collectionFields) : z.record(z.unknown()));
      break;
    default:
      // Covers the Newsletter-bundle-specific types (firstname/gender/
      // consent/etc., §4.3) deliberately left unhandled pending §3.3's
      // PII decision, and anything else genuinely unrecognized.
      fieldSchema = z.unknown();
  }

  return field.mandatory ? fieldSchema : fieldSchema.optional().nullable();
}

function compileFieldsShape(fields: ClassFieldDefinition[]): ZodSchema {
  const shape: Record<string, ZodSchema> = {};
  for (const field of fields) shape[field.name] = compileFieldSchema(field);
  return z.object(shape);
}

/**
 * Dynamic Zod Schema Compiler
 * Converts JSON Class Definitions into Zod runtime validators.
 */
export function compileDynamicSchema(definition: ClassDefinition): ZodSchema {
  return compileFieldsShape(definition.fields);
}
