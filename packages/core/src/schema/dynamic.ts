import { z, ZodSchema } from 'zod';

export interface ClassFieldDefinition {
  name: string;
  title: string;
  fieldType: string;
  mandatory?: boolean;
  localized?: boolean;
}

export interface ClassDefinition {
  id: string;
  name: string;
  fields: ClassFieldDefinition[];
}

/**
 * Dynamic Zod Schema Compiler
 * Converts JSON Class Definitions into Zod runtime validators.
 */
export function compileDynamicSchema(definition: ClassDefinition): ZodSchema {
  const shape: Record<string, ZodSchema> = {};

  for (const field of definition.fields) {
    let fieldSchema: ZodSchema = z.unknown();

    switch (field.fieldType) {
      case 'input':
      case 'textarea':
      case 'wysiwyg':
        fieldSchema = z.string();
        break;
      case 'numeric':
        fieldSchema = z.number();
        break;
      case 'checkbox':
        fieldSchema = z.boolean();
        break;
      default:
        fieldSchema = z.unknown();
    }

    if (!field.mandatory) {
      fieldSchema = fieldSchema.optional().nullable();
    }

    shape[field.name] = fieldSchema;
  }

  return z.object(shape);
}
