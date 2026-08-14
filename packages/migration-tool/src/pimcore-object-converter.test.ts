import { describe, it, expect } from 'vitest';
import { PimcoreObjectConverter, appendPimcoreSystemFields } from './pimcore-object-converter.js';
import type { RawPimcoreObjectAttributes } from './source-adapter.js';
import type { ClassFieldDefinition } from '@whoobe-cms/core';

// A fake, deterministic pair mirroring what cli.ts's real
// upsertDataObjectByPimcoreId-backed resolvers would do - see
// docs/plans/datamodel/advanced-data-modeling-plan.md §5.2/§8 Phase 3.
const resolveAssetPath = async (assetId: number) => (assetId === 999 ? null : `/assets/${assetId}.jpg`);
const resolveRelation = async (targetClassName: string, pimcoreId: string, _locale: string) =>
  targetClassName === 'Category' && pimcoreId === '1524' ? 'real-category-uuid' : null;

/** Builds a real PHP `serialize()` string for a protected-properties-only
 * object, computing every byte-length prefix from the actual values
 * rather than hand-counting them (a real, easy-to-get-wrong exercise -
 * this is deliberately test-only scaffolding, not a general PHP
 * serializer) - every real Pimcore `Data\Link` property is protected, so
 * this always uses the `\0*\0name` visibility prefix, matching real
 * migrated data exactly (confirmed against a live install). */
function phpSerializeProtectedObject(className: string, props: Record<string, string | number | null>): string {
  const entries = Object.entries(props);
  const parts = entries.map(([key, value]) => {
    const propKey = `\x00*\x00${key}`;
    const keyPart = `s:${Buffer.byteLength(propKey)}:"${propKey}"`;
    const valuePart =
      value === null ? 'N' : typeof value === 'number' ? `i:${value}` : `s:${Buffer.byteLength(value)}:"${value}"`;
    return `${keyPart};${valuePart}`;
  });
  // Every key;value entry ends with its own trailing `;`, including the
  // last one before the closing `}` - a real, easy off-by-one to miss.
  return `O:${Buffer.byteLength(className)}:"${className}":${entries.length}:{${parts.map((p) => `${p};`).join('')}}`;
}

describe('PimcoreObjectConverter (docs/plans/datamodel/advanced-data-modeling-plan.md §5.2, Phase 3)', () => {
  it('converts plain scalar field types (input/numeric/checkbox/date)', async () => {
    const fields: ClassFieldDefinition[] = [
      { name: 'title', title: 'Title', fieldType: 'input' },
      { name: 'order', title: 'Order', fieldType: 'numeric' },
      { name: 'active', title: 'Active', fieldType: 'checkbox' },
      { name: 'publicationDate', title: 'Date', fieldType: 'date' },
    ];
    const raw: RawPimcoreObjectAttributes = {
      columns: { title: 'Standard', order: '5', active: 1, publicationDate: 1735689600 },
      localizedByLocale: {},
      relations: [],
    };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.locale).toBe('en'); // no localized fields/tables -> single 'en' fallback
    expect(result.attributes.title).toBe('Standard');
    expect(result.attributes.order).toBe(5);
    expect(result.attributes.active).toBe(true);
    expect(result.attributes.publicationDate).toBe(new Date(1735689600 * 1000).toISOString());
  });

  it('produces one result per real locale table, with localized fields differing and non-localized fields duplicated', async () => {
    const fields: ClassFieldDefinition[] = [
      { name: 'name', title: 'Name', fieldType: 'input', localized: true },
      { name: 'order', title: 'Order', fieldType: 'numeric' },
    ];
    const raw: RawPimcoreObjectAttributes = {
      columns: { order: '2' },
      localizedByLocale: { en: { name: 'Standard' }, it: { name: 'Normale' } },
      relations: [],
    };
    const results = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(results).toHaveLength(2);
    const en = results.find((r) => r.locale === 'en')!;
    const it = results.find((r) => r.locale === 'it')!;
    expect(en.attributes.name).toBe('Standard');
    expect(it.attributes.name).toBe('Normale');
    expect(en.attributes.order).toBe(2);
    expect(it.attributes.order).toBe(2);
  });

  it('passes the current locale into resolveRelation, so a non-localized relation field still points at the target\'s matching-locale sibling row - a real Phase 4 finding (docs/plans/datamodel/advanced-data-modeling-plan.md), not designed in from the start', async () => {
    // Simulates a real, already-migrated Category whose 'en' and 'it'
    // rows are different internal uuids (real target's own translation
    // pair) - a non-localized relation field on the referencing object
    // (e.g. Product's `category`) should resolve to whichever sibling
    // matches the row currently being converted, not always the same one.
    const localeAwareResolve = async (targetClassName: string, pimcoreId: string, locale: string) => {
      if (targetClassName !== 'Category' || pimcoreId !== '1524') return null;
      return locale === 'it' ? 'category-it-uuid' : 'category-en-uuid';
    };
    const fields: ClassFieldDefinition[] = [
      { name: 'name', title: 'Name', fieldType: 'input', localized: true },
      { name: 'category', title: 'Category', fieldType: 'select', relationTarget: 'Category' },
    ];
    const raw: RawPimcoreObjectAttributes = {
      columns: { category: '1524' },
      localizedByLocale: { en: { name: 'Standard' }, it: { name: 'Normale' } },
      relations: [],
    };
    const results = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation: localeAwareResolve });
    const en = results.find((r) => r.locale === 'en')!;
    const it = results.find((r) => r.locale === 'it')!;
    expect(en.attributes.category).toEqual({ id: 'category-en-uuid' });
    expect(it.attributes.category).toEqual({ id: 'category-it-uuid' });
  });

  it('resolves a relation-flavored select to an already-migrated target, or a stated { id: null, pimcoreId } when unresolved', async () => {
    const fields: ClassFieldDefinition[] = [
      { name: 'category', title: 'Category', fieldType: 'select', relationTarget: 'Category' },
      { name: 'brand', title: 'Brand', fieldType: 'select', relationTarget: 'Brand' },
    ];
    const raw: RawPimcoreObjectAttributes = { columns: { category: '1524', brand: '9999' }, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.category).toEqual({ id: 'real-category-uuid' });
    expect(result.attributes.brand).toEqual({ id: null, pimcoreId: '9999' });
  });

  it('parses a delimited multiselect string and resolves each id', async () => {
    const fields: ClassFieldDefinition[] = [{ name: 'tags', title: 'Tags', fieldType: 'multiselect', relationTarget: 'Category' }];
    const raw: RawPimcoreObjectAttributes = { columns: { tags: ',1524,7,' }, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.tags).toEqual([{ id: 'real-category-uuid' }, { id: null, pimcoreId: '7' }]);
  });

  it('distinguishes an asset-type manyToOneRelation (resolved to a path) from an object-type one (resolved to an internal id)', async () => {
    const fields: ClassFieldDefinition[] = [
      { name: 'technicalSheet', title: 'Technical Sheet', fieldType: 'manyToOneRelation' },
      { name: 'detailPage', title: 'Detail Page', fieldType: 'manyToOneRelation', relationTarget: 'Category' },
    ];
    const raw: RawPimcoreObjectAttributes = {
      columns: {},
      localizedByLocale: {},
      relations: [
        { fieldname: 'technicalSheet', type: 'asset', destId: 42 },
        { fieldname: 'detailPage', type: 'object', destId: 1524 },
      ],
    };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.technicalSheet).toEqual({ assetId: '/assets/42.jpg' });
    expect(result.attributes.detailPage).toEqual({ id: 'real-category-uuid' });
  });

  it('resolves an image field (a bare asset id in its own column, not a relation edge) to a real path', async () => {
    const fields: ClassFieldDefinition[] = [{ name: 'header', title: 'Header', fieldType: 'image' }];
    const raw: RawPimcoreObjectAttributes = { columns: { header: 42 }, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.header).toEqual({ assetId: '/assets/42.jpg' });
  });

  it('returns null for an asset relation whose asset no longer resolves, rather than a broken reference', async () => {
    const fields: ClassFieldDefinition[] = [{ name: 'technicalSheet', title: 'Technical Sheet', fieldType: 'manyToOneRelation' }];
    const raw: RawPimcoreObjectAttributes = { columns: {}, localizedByLocale: {}, relations: [{ fieldname: 'technicalSheet', type: 'asset', destId: 999 }] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.technicalSheet).toBeNull();
  });

  it('falls back to the raw column id string when a relation-targeted manyToOneRelation has no object_relations edge (Product\'s real category/brand shape)', async () => {
    const fields: ClassFieldDefinition[] = [{ name: 'category', title: 'Category', fieldType: 'manyToOneRelation', relationTarget: 'Category' }];
    const raw: RawPimcoreObjectAttributes = { columns: { category: '1524' }, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.category).toEqual({ id: 'real-category-uuid' });
  });

  it('keeps a manyToOneRelation without relationTarget null when there is no edge and no usable column value', async () => {
    const fields: ClassFieldDefinition[] = [{ name: 'technicalSheet', title: 'Technical Sheet', fieldType: 'manyToOneRelation' }];
    const raw: RawPimcoreObjectAttributes = { columns: { technicalSheet: '42' }, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.technicalSheet).toBeNull();
  });

  it('falls back to a delimited id string for the multi-relation family with no edges (Product\'s real tags shape)', async () => {
    const fields: ClassFieldDefinition[] = [{ name: 'tags', title: 'Tags', fieldType: 'advancedManyToManyRelation', relationTarget: 'Category' }];
    const raw: RawPimcoreObjectAttributes = { columns: { tags: ',1524,7,' }, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.tags).toEqual([{ id: 'real-category-uuid' }, { id: null, pimcoreId: '7' }]);
  });

  it('collects a multi-relation family field into an array, mixing resolved assets and unresolved objects', async () => {
    const fields: ClassFieldDefinition[] = [{ name: 'technicalSheets', title: 'Technical Sheets', fieldType: 'advancedManyToManyRelation' }];
    const raw: RawPimcoreObjectAttributes = {
      columns: {},
      localizedByLocale: {},
      relations: [
        { fieldname: 'technicalSheets', type: 'asset', destId: 1 },
        { fieldname: 'technicalSheets', type: 'asset', destId: 2 },
      ],
    };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.technicalSheets).toEqual([{ assetId: '/assets/1.jpg' }, { assetId: '/assets/2.jpg' }]);
  });

  it('states block as an explicit, empty gap rather than fabricating parsed content (no block-typed field appears in this install\'s real true-PIM scope)', async () => {
    const fields: ClassFieldDefinition[] = [{ name: 'variants', title: 'Variants', fieldType: 'block' }];
    const raw: RawPimcoreObjectAttributes = { columns: {}, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.variants).toEqual([]);
  });

  it('returns the empty link shape for un-parseable/empty raw values, without throwing', async () => {
    const fields: ClassFieldDefinition[] = [{ name: 'cta', title: 'CTA', fieldType: 'link' }];
    const raw: RawPimcoreObjectAttributes = { columns: { cta: 'a:0:{}' }, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.cta).toEqual({ path: null, text: null, target: null });
  });

  it('parses a real PHP-serialized Pimcore Link object (§6, Phase 6) - a direct link and an internal one', async () => {
    const linkClassName = 'Pimcore\\Model\\DataObject\\Data\\Link';
    const directLink = phpSerializeProtectedObject(linkClassName, {
      text: 'Go here',
      linktype: 'direct',
      direct: '/en/page/',
      target: '_blank',
    });
    const internalLink = phpSerializeProtectedObject(linkClassName, {
      internalType: 'document',
      internal: 170,
      linktype: 'internal',
    });

    const fields: ClassFieldDefinition[] = [
      { name: 'ctaDirect', title: 'CTA', fieldType: 'link' },
      { name: 'ctaInternal', title: 'CTA Internal', fieldType: 'link' },
    ];
    const raw: RawPimcoreObjectAttributes = {
      columns: { ctaDirect: directLink, ctaInternal: internalLink },
      localizedByLocale: {},
      relations: [],
    };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.ctaDirect).toEqual({ path: '/en/page/', text: 'Go here', target: '_blank' });
    expect(result.attributes.ctaInternal).toEqual({ path: '[internal document:170]', text: null, target: null });
  });

  it('converts real Field Collection items (§6, Phase 6) - a tagged mix of two different collection types, in the real interleaved order Pimcore stores', async () => {
    const fields: ClassFieldDefinition[] = [
      {
        name: 'content',
        title: 'Content',
        fieldType: 'fieldcollections',
        collectionTypes: [
          {
            name: 'ProductBanner',
            label: 'ProductBanner',
            fields: [
              { name: 'image', title: 'Image', fieldType: 'image' },
              { name: 'title', title: 'Title', fieldType: 'input', localized: true },
            ],
          },
          {
            name: 'ProductVariants',
            label: 'ProductVariants',
            fields: [{ name: 'format', title: 'Format', fieldType: 'input', mandatory: true }],
          },
        ],
      },
    ];
    const raw: RawPimcoreObjectAttributes = {
      columns: {},
      // A real Product-shaped object always has top-level localized
      // fields too (slug/name/abstract) - this is what actually drives
      // convertObject's own per-locale loop; a class with *only*
      // field-collection-level localized content and nothing at the top
      // level isn't a real shape this install has, so this fixture
      // matches the real one instead of constructing an artificial edge
      // case the converter was never meant to handle standalone.
      localizedByLocale: { en: {}, it: {} },
      relations: [],
      fieldCollections: [
        // Real order confirmed against migrated data: types interleave,
        // sorted by one shared `index` - ProductVariants at index 0,
        // ProductBanner after it, not grouped by type first.
        { fieldname: 'content', collectionType: 'ProductVariants', index: 0, columns: { format: '0.5L' }, localizedByLocale: {} },
        {
          fieldname: 'content',
          collectionType: 'ProductBanner',
          index: 1,
          columns: { image: 42 },
          localizedByLocale: { en: { title: 'Banner EN' }, it: { title: 'Banner IT' } },
        },
      ],
    };
    const results = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    const en = results.find((r) => r.locale === 'en')!;
    const it = results.find((r) => r.locale === 'it')!;

    const enItems = en.attributes.content as Record<string, unknown>[];
    expect(enItems).toHaveLength(2);
    expect(enItems[0]).toMatchObject({ collectionType: 'ProductVariants', format: '0.5L' });
    expect(enItems[1]).toMatchObject({ collectionType: 'ProductBanner', title: 'Banner EN' });
    expect((enItems[1] as any).image).toEqual({ assetId: '/assets/42.jpg' });

    const itItems = it.attributes.content as Record<string, unknown>[];
    expect(itItems[1]).toMatchObject({ collectionType: 'ProductBanner', title: 'Banner IT' });
  });

  it('skips a Field Collection item whose collectionType isn\'t among the field\'s own collectionTypes, rather than guessing its shape', async () => {
    const fields: ClassFieldDefinition[] = [
      { name: 'content', title: 'Content', fieldType: 'fieldcollections', collectionTypes: [] },
    ];
    const raw: RawPimcoreObjectAttributes = {
      columns: {},
      localizedByLocale: {},
      relations: [],
      fieldCollections: [{ fieldname: 'content', collectionType: 'SomeRemovedType', index: 0, columns: {}, localizedByLocale: {} }],
    };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.content).toEqual([]);
  });

  it('falls back to the Phase 2/3 single-shared-shape behavior for fieldcollections when collectionTypes is absent', async () => {
    const fields: ClassFieldDefinition[] = [{ name: 'content', title: 'Content', fieldType: 'fieldcollections' }];
    const raw: RawPimcoreObjectAttributes = { columns: {}, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.content).toEqual([]);
  });

  it('always appends Pimcore system date fields, deduped by name', () => {
    const fields: ClassFieldDefinition[] = [
      { name: 'name', title: 'Name', fieldType: 'input' },
      { name: 'o_modificationDate', title: 'Modification Date', fieldType: 'date' },
    ];
    appendPimcoreSystemFields(fields);
    expect(fields.map((f) => f.name)).toEqual(['name', 'o_modificationDate', 'o_creationDate']);
  });

  it('converts the system date fields (Unix seconds) into ISO date values', async () => {
    const fields: ClassFieldDefinition[] = [
      { name: 'o_creationDate', title: 'Creation Date', fieldType: 'date' },
      { name: 'o_modificationDate', title: 'Modification Date', fieldType: 'date' },
    ];
    const raw: RawPimcoreObjectAttributes = { columns: { o_creationDate: 1645008088, o_modificationDate: 1748444485 }, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.o_creationDate).toBe('2022-02-16T10:41:28.000Z');
    expect(result.attributes.o_modificationDate).toBe('2025-05-28T15:01:25.000Z');
  });
});
