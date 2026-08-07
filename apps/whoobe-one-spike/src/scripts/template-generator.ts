// Generates an Element tree from a DataClassRecord's field definitions.
// Each field type is mapped to an appropriate Element type, pre-bound to
// the field via setDataBinding. The result is a Flexbox container with
// bound children, ready to insert into the document.
import Element from './ElementsClass.js'
import type { ElementDataBinding } from './ElementsClass.js'
import type { ClassFieldDefinition, DataClassRecord } from '../data-objects-api'

type WhoobeElement = InstanceType<typeof Element>

/** Field types that map to text content elements (Paragraph, Heading). */
const TEXT_FIELDS = ['input', 'textarea', 'wysiwyg', 'urlSlug', 'email', 'country', 'select', 'multiselect']

/** Field types that map to Image elements. */
const IMAGE_FIELDS = ['image', 'video', 'asset']

/** Field types that map to number/inline elements. */
const NUMERIC_FIELDS = ['numeric', 'slider', 'range']

/** Field types that map to link elements. */
const LINK_FIELDS = ['link', 'manyToOneRelation', 'manyToManyRelation']

/** Generate a Flexbox container with pre-bound elements for each field
 *  of the given data class. Returns the root Element (Flexbox). */
export function generateTemplateFromClass(dataClass: DataClassRecord): WhoobeElement {
  const root = new Element().createElement('Flexbox', { direction: 'col' }) as WhoobeElement
  if (!root) throw new Error('Failed to create Flexbox container')

  root.setTag('div')
  root.setCss('p-4 gap-4')

  for (const field of dataClass.fields) {
    const child = createFieldElement(field, dataClass.name)
    if (child) root.blocks.push(child)
  }

  return root
}

function createFieldElement(field: ClassFieldDefinition, className: string): WhoobeElement | null {
  const ft = field.fieldType

  // Filter out fields that don't have a meaningful UI representation
  if (ft === 'fieldcollections' || ft === 'block' || ft === 'hidden') return null

  if (IMAGE_FIELDS.includes(ft)) {
    return createBoundElement('Image', className, field, 'src')
  }

  if (LINK_FIELDS.includes(ft)) {
    return createBoundElement('Paragraph', className, field, 'href')
  }

  if (NUMERIC_FIELDS.includes(ft)) {
    return createBoundElement('Inline Text', className, field, 'content')
  }

  if (ft === 'checkbox') {
    return createBoundElement('Checkbox', className, field, 'custom')
  }

  // Default: text-based element
  return createBoundElement('Paragraph', className, field, 'content')
}

function createBoundElement(
  elementName: string,
  className: string,
  field: ClassFieldDefinition,
  target: string
): WhoobeElement {
  const el = new Element().createElement(elementName, {}) as WhoobeElement
  if (!el) throw new Error(`Failed to create ${elementName}`)

  const binding: ElementDataBinding = {
    className,
    target,
    field: field.name,
    resolveMode: 'first',
  }

  el.setDataBinding(binding)

  // Set a placeholder label so the element has visible content in the editor
  el.content = field.title || field.name
  if (elementName === 'Image') {
    el.image = { url: null }
  }

  return el
}