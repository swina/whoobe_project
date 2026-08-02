import { describe, it, expect, beforeAll } from 'vitest';
import { createPimcoreSourceAdapter } from './source-adapter.js';
import { registerAreabrickConverter } from './pimcore-document-converter.js';
import { PimcoreDocumentConverter, PimcoreRawDocument, PimcoreEditableElement } from './pimcore-document-converter.js';
import type { FixturePimcoreDataset } from './adapters/fixture-adapter.js';
import './adapters/fixture-adapter.js';

/**
 * Test-only PHP serializer (the mirror image of php-unserialize.ts),
 * used solely to build valid fixture data without hand-counting byte
 * lengths, which is exactly the kind of error the real parser is meant to
 * be robust against - see the corrected byte-length bugs in
 * php-unserialize.test.ts's first draft.
 */
function phpSerialize(value: unknown): string {
  if (value === null || value === undefined) return 'N;';
  if (typeof value === 'boolean') return `b:${value ? 1 : 0};`;
  if (typeof value === 'number') return Number.isInteger(value) ? `i:${value};` : `d:${value};`;
  if (typeof value === 'string') return `s:${Buffer.byteLength(value)}:"${value}";`;
  if (Array.isArray(value)) {
    const parts = value.map((v, i) => phpSerialize(i) + phpSerialize(v)).join('');
    return `a:${value.length}:{${parts}}`;
  }
  const keys = Object.keys(value as object);
  const parts = keys.map((k) => phpSerialize(k) + phpSerialize((value as Record<string, unknown>)[k])).join('');
  return `a:${keys.length}:{${parts}}`;
}

describe('Pimcore ETL pipeline (fixture adapter -> converter)', () => {
  beforeAll(() => {
    // Registers a real mapping for the "herobanner" brick, proving the
    // plugin extension point works end to end; "customwidget" is left
    // unregistered on purpose to exercise the generic fallback.
    registerAreabrickConverter('herobanner', (index, brick) => ({
      id: `hero_${index}`,
      type: 'container',
      name: 'Hero Banner',
      tag: 'section',
      props: {
        headline: brick.fields.headline?.data,
        imageSrc: brick.fields.image?.data?.path,
      },
    }));
  });

  it('imports a document with a mapped brick and an unmapped brick side by side', async () => {
    const dataset: FixturePimcoreDataset = {
      documents: [{ id: 1, parentId: 0, type: 'page', key: 'home', path: '/home', title: 'Home' }],
      assetPathsById: { 42: '/images/hero.jpg' },
      elementRowsByDocumentId: {
        1: [
          { documentId: 1, name: 'headline', type: 'input', data: 'Welcome' },
          {
            documentId: 1,
            name: 'content',
            type: 'areablock',
            // Real slot shape confirmed against a live Pimcore instance:
            // {key, type, hidden} - sibling fields are named by `key`, not
            // array position or brick type (see pimcore-serialized-data.ts).
            data: phpSerialize([
              { key: '9', type: 'herobanner', hidden: false },
              { key: '8', type: 'customwidget', hidden: false },
            ]),
          },
          { documentId: 1, name: 'content:9.headline', type: 'input', data: 'Big Hero' },
          {
            documentId: 1,
            name: 'content:9.image',
            type: 'image',
            data: phpSerialize({ id: 42, alt: 'Hero Alt' }),
          },
          { documentId: 1, name: 'content:8.label', type: 'input', data: 'Custom Label' },
        ],
      },
    };

    const adapter = createPimcoreSourceAdapter('fixture', { dataset });
    await adapter.connect();

    const documents = await adapter.listDocuments();
    expect(documents).toHaveLength(1);

    const elements = await adapter.getDocumentElements(1);
    // Only 2 top-level editables: "headline" and "content" (the areablock).
    // The 3 brick sub-field rows are consumed, not independent top-level entries.
    expect(elements).toHaveLength(2);

    const elementsByName: Record<string, PimcoreEditableElement> = {};
    for (const el of elements) elementsByName[el.name] = el;

    const rawDoc: PimcoreRawDocument = {
      id: documents[0].id,
      parentId: documents[0].parentId,
      type: documents[0].type,
      key: documents[0].key,
      path: documents[0].path,
      title: documents[0].title,
      elements: elementsByName,
    };

    const converted = PimcoreDocumentConverter.convertDocument(rawDoc);
    expect(converted.slug).toBe('/home');
    expect(converted.rootBlock.children).toHaveLength(2);

    const areablock = converted.rootBlock.children!.find((c) => c.name === 'content')!;
    expect(areablock.type).toBe('areablock');
    expect(areablock.children).toHaveLength(2);

    // Mapped brick: went through the registered "herobanner" converter.
    const heroBlock = areablock.children![0];
    expect(heroBlock.name).toBe('Hero Banner');
    expect(heroBlock.props?.headline).toBe('Big Hero');
    expect(heroBlock.props?.imageSrc).toBe('/images/hero.jpg');

    // Unmapped brick: fell back to the generic container, content preserved.
    const fallbackBlock = areablock.children![1];
    expect(fallbackBlock.name).toBe('Unmapped Brick: customwidget');
    expect(fallbackBlock.props?.unmappedBrickType).toBe('customwidget');
    expect(fallbackBlock.children).toHaveLength(1);
    expect(fallbackBlock.children![0].content).toBe('Custom Label');

    await adapter.disconnect();
  });
});
