// Ready-made Data Classes for the wizard in ClassSettingsCard.vue ("+ From template"): the fields a Contact, a Category or a Product
// usually have, grouped in the View Layout sections and the list columns the object editor and the object list use. Each field can be
// switched off in the wizard; a relation field (a product's category, a category's parent) is pointed at a class of this website.
import type { ClassFieldDefinition, ClassViewConfig } from '@whoobe-cms/core'

export interface PresetField {
  field: ClassFieldDefinition
  /** Offered but not ticked by default. */
  optional?: boolean
  /** View Layout section it belongs to. */
  section: string
}

export interface ClassPreset {
  key: 'contact' | 'category' | 'product'
  title: string
  description: string
  /** Default class name (the identifier bindings and relations use) and label. */
  name: string
  label: string
  fields: PresetField[]
  listColumns: string[]
}

const f = (name: string, title: string, fieldType: string, extra: Partial<ClassFieldDefinition> = {}): ClassFieldDefinition => ({ name, title, fieldType, ...extra })

export const CLASS_PRESETS: ClassPreset[] = [
  {
    key: 'contact',
    title: 'Contact',
    description: 'People and companies you talk to: name, email, phone, company, newsletter consent.',
    name: 'Contact',
    label: 'Contact',
    listColumns: ['lastName', 'firstName', 'email', 'company'],
    fields: [
      { section: 'Person', field: f('firstName', 'First name', 'input') },
      { section: 'Person', field: f('lastName', 'Last name', 'input', { mandatory: true }) },
      { section: 'Person', field: f('email', 'Email', 'email', { mandatory: true }) },
      { section: 'Person', field: f('phone', 'Phone', 'input') },
      { section: 'Company', field: f('company', 'Company', 'input') },
      { section: 'Company', field: f('jobTitle', 'Job title', 'input') },
      { section: 'Company', field: f('website', 'Website', 'link'), optional: true },
      { section: 'Address', field: f('address', 'Address', 'input'), optional: true },
      { section: 'Address', field: f('city', 'City', 'input'), optional: true },
      { section: 'Address', field: f('postalCode', 'Postal code', 'input'), optional: true },
      { section: 'Address', field: f('country', 'Country', 'country'), optional: true },
      { section: 'Notes', field: f('source', 'Source', 'select', { options: ['website', 'newsletter', 'event', 'referral', 'other'] }) },
      { section: 'Notes', field: f('newsletterConsent', 'Newsletter consent', 'checkbox') },
      { section: 'Notes', field: f('notes', 'Notes', 'textarea') },
    ],
  },
  {
    key: 'category',
    title: 'Category',
    description: 'A way to group things (products, articles): name, slug, description, image, optional parent category.',
    name: 'Category',
    label: 'Category',
    listColumns: ['name', 'slug', 'order'],
    fields: [
      { section: 'Category', field: f('name', 'Name', 'input', { mandatory: true }) },
      { section: 'Category', field: f('slug', 'Slug', 'urlSlug', { mandatory: true }) },
      { section: 'Category', field: f('description', 'Description', 'textarea') },
      { section: 'Category', field: f('image', 'Image', 'image') },
      { section: 'Category', field: f('order', 'Sort order', 'numeric') },
      // points at this same class: filled in by buildPreset
      { section: 'Category', field: f('parent', 'Parent category', 'manyToOneRelation', { relationTarget: '' }), optional: true },
    ],
  },
  {
    key: 'product',
    title: 'Product',
    description: 'Something you sell or show: name, slug, SKU, descriptions, price, stock, images, category.',
    name: 'Product',
    label: 'Product',
    listColumns: ['name', 'sku', 'price', 'available'],
    fields: [
      { section: 'Product', field: f('name', 'Name', 'input', { mandatory: true }) },
      { section: 'Product', field: f('slug', 'Slug', 'urlSlug', { mandatory: true }) },
      { section: 'Product', field: f('sku', 'SKU', 'input') },
      // the class this points at is chosen in the wizard (an existing class, or a new Category)
      { section: 'Product', field: f('category', 'Category', 'manyToOneRelation', { relationTarget: '' }) },
      { section: 'Product', field: f('tags', 'Tags', 'array'), optional: true },
      { section: 'Description', field: f('shortDescription', 'Short description', 'textarea') },
      { section: 'Description', field: f('description', 'Description', 'wysiwyg') },
      { section: 'Media', field: f('mainImage', 'Main image', 'image') },
      { section: 'Media', field: f('gallery', 'Gallery', 'block', { blockFields: [f('image', 'Image', 'image'), f('caption', 'Caption', 'input')] }), optional: true },
      { section: 'Price and stock', field: f('price', 'Price', 'numeric', { mandatory: true }) },
      { section: 'Price and stock', field: f('currency', 'Currency', 'select', { options: ['EUR', 'USD', 'GBP', 'CHF'] }) },
      { section: 'Price and stock', field: f('stock', 'Stock', 'numeric') },
      { section: 'Price and stock', field: f('available', 'Available', 'checkbox') },
    ],
  },
]

export interface PresetChoice {
  name: string
  label: string
  /** Names of the fields to keep. */
  fieldNames: string[]
  /** Class name the preset's relation fields point at (a category's `parent` always points at the class itself). */
  relationTarget?: string
}

/** The class a wizard choice makes: the ticked fields (a relation with no target is left out) and the View Layout sections / list columns that still apply. */
export function buildPreset(preset: ClassPreset, choice: PresetChoice): { name: string; label: string; fields: ClassFieldDefinition[]; viewConfig: ClassViewConfig } {
  const keep = new Set(choice.fieldNames)
  const chosen = preset.fields.filter((p) => keep.has(p.field.name)).flatMap((p) => {
    const field = JSON.parse(JSON.stringify(p.field)) as ClassFieldDefinition
    if (field.fieldType === 'manyToOneRelation') {
      const target = preset.key === 'category' ? choice.name : choice.relationTarget
      if (!target) return []
      field.relationTarget = target
    }
    return [{ field, section: p.section }]
  })
  const sections: { title: string; fields: string[] }[] = []
  for (const c of chosen) {
    let s = sections.find((x) => x.title === c.section)
    if (!s) sections.push((s = { title: c.section, fields: [] }))
    s.fields.push(c.field.name)
  }
  const names = new Set(chosen.map((c) => c.field.name))
  return {
    name: choice.name.trim(),
    label: choice.label.trim(),
    fields: chosen.map((c) => c.field),
    viewConfig: { detailSections: sections, listColumns: preset.listColumns.filter((n) => names.has(n)).map((name) => ({ name })) },
  }
}
