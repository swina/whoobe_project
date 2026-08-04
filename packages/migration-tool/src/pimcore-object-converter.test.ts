import { describe, it, expect } from 'vitest';
import { PimcoreObjectConverter } from './pimcore-object-converter.js';
import type { RawPimcoreObjectAttributes } from './source-adapter.js';
import type { ClassFieldDefinition } from '@pimcore-custom/core';

// A fake, deterministic pair mirroring what cli.ts's real
// upsertDataObjectByPimcoreId-backed resolvers would do - see
// docs/plans/datamodel/advanced-data-modeling-plan.md §5.2/§8 Phase 3.
const resolveAssetPath = async (assetId: number) => (assetId === 999 ? null : `/assets/${assetId}.jpg`);
const resolveRelation = async (targetClassName: string, pimcoreId: string, _locale: string) =>
  targetClassName === 'Category' && pimcoreId === '1524' ? 'real-category-uuid' : null;

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

  it('states block/fieldcollections/link as explicit, empty gaps rather than fabricating parsed content', async () => {
    const fields: ClassFieldDefinition[] = [
      { name: 'content', title: 'Content', fieldType: 'fieldcollections' },
      { name: 'variants', title: 'Variants', fieldType: 'block' },
      { name: 'cta', title: 'CTA', fieldType: 'link' },
    ];
    const raw: RawPimcoreObjectAttributes = { columns: { cta: 'a:0:{}' }, localizedByLocale: {}, relations: [] };
    const [result] = await PimcoreObjectConverter.convertObject(raw, fields, { resolveAssetPath, resolveRelation });
    expect(result.attributes.content).toEqual([]);
    expect(result.attributes.variants).toEqual([]);
    expect(result.attributes.cta).toEqual({ path: null, text: null, target: null });
  });
});
