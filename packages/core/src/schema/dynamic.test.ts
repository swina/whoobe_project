import { describe, it, expect } from 'vitest';
import { compileDynamicSchema, type ClassDefinition } from './dynamic.js';

describe('compileDynamicSchema (docs/plans/datamodel/advanced-data-modeling-plan.md §4.3, Phase 2)', () => {
  it('validates the already-handled plain types (input/numeric/checkbox), mandatory vs optional', () => {
    const def: ClassDefinition = {
      id: '1',
      name: 'Basic',
      fields: [
        { name: 'title', title: 'Title', fieldType: 'input', mandatory: true },
        { name: 'order', title: 'Order', fieldType: 'numeric' },
        { name: 'active', title: 'Active', fieldType: 'checkbox' },
      ],
    };
    const schema = compileDynamicSchema(def);
    expect(schema.safeParse({ title: 'Hello', order: 1, active: true }).success).toBe(true);
    expect(schema.safeParse({ order: 1, active: true }).success).toBe(false); // title mandatory
    expect(schema.safeParse({ title: 'Hello' }).success).toBe(true); // order/active optional
  });

  it('treats a select with relationTarget as a relation id object, and a plain select as an enum', () => {
    const def: ClassDefinition = {
      id: '2',
      name: 'Product',
      fields: [
        { name: 'category', title: 'Category', fieldType: 'select', relationTarget: 'Category' },
        { name: 'unit', title: 'Unit', fieldType: 'select', options: ['ml', 'l'] },
      ],
    };
    const schema = compileDynamicSchema(def);
    expect(schema.safeParse({ category: { id: 'abc' }, unit: 'ml' }).success).toBe(true);
    expect(schema.safeParse({ category: null, unit: null }).success).toBe(true);
    expect(schema.safeParse({ category: { id: 'abc' }, unit: 'gallons' }).success).toBe(false);
  });

  it('parses multiselect as a string array', () => {
    const def: ClassDefinition = { id: '3', name: 'X', fields: [{ name: 'tags', title: 'Tags', fieldType: 'multiselect' }] };
    const schema = compileDynamicSchema(def);
    expect(schema.safeParse({ tags: ['a', 'b'] }).success).toBe(true);
    expect(schema.safeParse({ tags: 'a,b' }).success).toBe(false);
  });

  it('distinguishes manyToOneRelation with/without relationTarget (object vs asset)', () => {
    const def: ClassDefinition = {
      id: '4',
      name: 'Product',
      fields: [
        { name: 'detailPage', title: 'Detail Page', fieldType: 'manyToOneRelation', relationTarget: 'Document' },
        { name: 'technicalSheet', title: 'Technical Sheet', fieldType: 'manyToOneRelation' },
      ],
    };
    const schema = compileDynamicSchema(def);
    expect(schema.safeParse({ detailPage: { id: '1' }, technicalSheet: { assetId: 'a1' } }).success).toBe(true);
    expect(schema.safeParse({ detailPage: { assetId: 'a1' }, technicalSheet: null }).success).toBe(false);
  });

  it('parses the multi-relation family as an array of relation ids', () => {
    const def: ClassDefinition = {
      id: '5',
      name: 'Product',
      fields: [{ name: 'technicalSheets', title: 'Technical Sheets', fieldType: 'advancedManyToManyRelation' }],
    };
    const schema = compileDynamicSchema(def);
    expect(schema.safeParse({ technicalSheets: [{ id: '1' }, { id: '2' }] }).success).toBe(true);
  });

  it('parses link as a structured path/text/target object', () => {
    const def: ClassDefinition = { id: '6', name: 'X', fields: [{ name: 'cta', title: 'CTA', fieldType: 'link', mandatory: true }] };
    const schema = compileDynamicSchema(def);
    expect(schema.safeParse({ cta: { path: '/x', text: 'Go', target: '_self' } }).success).toBe(true);
    expect(schema.safeParse({ cta: { path: '/x' } }).success).toBe(false); // text/target required keys (nullable, not optional)
  });

  it('recursively compiles a block field from its own inline blockFields', () => {
    const def: ClassDefinition = {
      id: '7',
      name: 'ProductVariants',
      fields: [
        {
          name: 'variants',
          title: 'Variants',
          fieldType: 'block',
          mandatory: true,
          blockFields: [
            { name: 'format', title: 'Format', fieldType: 'input', mandatory: true },
            { name: 'flavour', title: 'Flavour', fieldType: 'select', options: ['still', 'sparkling'] },
          ],
        },
      ],
    };
    const schema = compileDynamicSchema(def);
    expect(schema.safeParse({ variants: [{ format: '0.5L' }, { format: '1L', flavour: 'still' }] }).success).toBe(true);
    expect(schema.safeParse({ variants: [{ flavour: 'still' }] }).success).toBe(false); // format mandatory inside the block
  });

  it('compiles fieldcollections as an array using a single shared shape (Phase 2 scope, not per-type - see file header)', () => {
    const def: ClassDefinition = {
      id: '8',
      name: 'Product',
      fields: [
        {
          name: 'content',
          title: 'Content',
          fieldType: 'fieldcollections',
          collectionFields: [{ name: 'image', title: 'Image', fieldType: 'video' }],
        },
      ],
    };
    const schema = compileDynamicSchema(def);
    expect(schema.safeParse({ content: [{ image: { assetId: 'a1' } }] }).success).toBe(true);
  });

  it('falls back to z.unknown() for unrecognized/deferred field types (e.g. Newsletter-bundle-specific)', () => {
    const def: ClassDefinition = { id: '9', name: 'Newsletter', fields: [{ name: 'optin', title: 'Opt-in', fieldType: 'consent' }] };
    const schema = compileDynamicSchema(def);
    expect(schema.safeParse({ optin: 'anything at all' }).success).toBe(true);
  });
});
