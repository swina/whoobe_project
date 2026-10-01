// Generates an Element tree from a DataClassRecord's field definitions.
// Each field type is mapped to an appropriate Element type, pre-bound to
// the field via setDataBinding. The result is a Flexbox container with
// bound children, ready to insert into the document.
import Element from './ElementsClass.js'
import type { ElementDataBinding } from './ElementsClass.js'
import type { ClassFieldDefinition, DataClassRecord } from '../data-objects-api'

type WhoobeElement = InstanceType<typeof Element>

// Same SVG placeholder the editor uses for freshly-created Image elements
// (helpers.ts) - a gray box with a mountain icon, so the element is visible
// and selectable in the canvas even before its binding is resolved.
const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">' +
      '<rect width="320" height="180" fill="#e5e7eb"/>' +
      '<path d="M40 130 L110 70 L150 105 L200 55 L280 130 Z" fill="#9ca3af"/>' +
      '<circle cx="100" cy="50" r="18" fill="#9ca3af"/>' +
      '</svg>'
  )

/** Field types that map to text content elements (Paragraph, Heading). */
const TEXT_FIELDS = ['input', 'textarea', 'wysiwyg', 'markdown', 'urlSlug', 'email', 'country', 'select', 'multiselect']

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
    // No objectId: this is a relative binding. The child inherits its
    // data from the nearest container ancestor's resolved object (via
    // the dataContext prop threaded through BlockContainer/BlockElement).
    resolveMode: 'explicit',
  }

  el.setDataBinding(binding)

  // Remove any field label placeholder - the element shows data or nothing.
  el.content = ''

  if (elementName === 'Image') {
    // Give the Image a visible placeholder (grey box with a mountain icon,
    // the same one helpers.ts applies to freshly-created images) - without
    // it, an <img> with no src renders at 0x0 and is impossible to see or
    // select in the canvas.
    el.image = { url: PLACEHOLDER_IMAGE }
  }

  return el
}