// Field mapping for the Pimcore class import (PimcoreClassMappingModal.vue): which field types the dashboard and the object converter handle,
// and what to propose for the types they do not (Pimcore plugins: gender, firstname, time, table, objectbricks...).

/** Types a class field can be given in the mapping screen (the converter reads their values; the dashboard edits them). */
export const MAPPABLE_TYPES = [
  { value: 'input', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'wysiwyg', label: 'Rich text' },
  { value: 'numeric', label: 'Number' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'urlSlug', label: 'Slug (URL)' },
  { value: 'country', label: 'Country' },
  { value: 'select', label: 'Select (single)' },
  { value: 'multiselect', label: 'Select (multiple)' },
  { value: 'manyToOneRelation', label: 'Relation (single)' },
  { value: 'manyToManyRelation', label: 'Relation (multiple)' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'link', label: 'Link' },
  { value: 'block', label: 'Block' },
  { value: 'fieldcollections', label: 'Components (repeatable)' },
] as const

const KNOWN = new Set<string>([
  ...MAPPABLE_TYPES.map((t) => t.value),
  'manyToManyObjectRelation', 'advancedManyToManyRelation', 'markdown', 'array', 'json', 'asset',
])

/** True for a field type the dashboard can edit and the object import can convert. */
export function isSupportedFieldType(fieldType: string): boolean {
  return KNOWN.has(fieldType)
}

/** The fields of a class (top level) whose type Whoobe does not support: their values would be copied as they are, and not editable. */
export function unsupportedFields(fields: { name: string; fieldType: string }[]): { name: string; fieldType: string }[] {
  return fields.filter((f) => !f.name.startsWith('o_') && !isSupportedFieldType(f.fieldType))
}

/** What to propose for a field type of the source: keep it when it is known, else a type that carries its value, or leave the field out. */
export function suggestMapping(pimcoreType: string): { fieldType: string; include: boolean; note?: string } {
  if (KNOWN.has(pimcoreType)) return { fieldType: pimcoreType, include: true }
  switch (pimcoreType) {
    case 'firstname':
    case 'lastname':
    case 'gender':
    case 'time':
    case 'language':
    case 'slider':
    case 'inputQuantityValue':
      return { fieldType: pimcoreType === 'slider' ? 'numeric' : 'input', include: true, note: `${pimcoreType} (Pimcore plugin type) as ${pimcoreType === 'slider' ? 'number' : 'text'}` }
    case 'advancedManyToManyObjectRelation':
      return { fieldType: 'manyToManyRelation', include: true, note: `${pimcoreType} as relation (multiple)` }
    case 'password':
      return { fieldType: 'input', include: false, note: 'password: left out (a secret should not be copied as text)' }
    case 'datetime':
    case 'datetimerange':
      return { fieldType: 'date', include: true, note: `${pimcoreType} as date` }
    case 'newsletterActive':
    case 'newsletterConfirmed':
    case 'consent':
    case 'booleanSelect':
      return { fieldType: 'checkbox', include: true, note: `${pimcoreType} as checkbox` }
    default:
      // tables, object bricks, target groups, geo fields...: no editable type carries them
      return { fieldType: 'input', include: false, note: `${pimcoreType} has no equivalent: left out` }
  }
}
