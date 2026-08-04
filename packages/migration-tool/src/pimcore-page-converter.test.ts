import { describe, it, expect } from 'vitest';
import { PimcorePageConverter } from './pimcore-page-converter.js';
import type { PimcoreRawDocument } from './pimcore-document-converter.js';

describe('PimcorePageConverter (whoobe_pages target - integration plan Phase 2)', () => {
  it('converts a basic Pimcore raw document into an Element tree', () => {
    const rawDoc: PimcoreRawDocument = {
      id: 42,
      parentId: 1,
      type: 'page',
      key: 'homepage',
      path: '/homepage',
      title: 'Company Homepage',
      elements: {
        headline: { name: 'headline', type: 'input', data: 'Welcome to Enterprise CMS' },
        mainContent: { name: 'mainContent', type: 'wysiwyg', data: '<p>Migrated from Pimcore legacy PHP monolith.</p>' },
        heroBanner: { name: 'heroBanner', type: 'image', data: { path: '/logos/hero_banner.png', alt: 'Hero Banner Alt' } },
      },
    };

    const result = PimcorePageConverter.convertDocument(rawDoc, 'http://localhost:9000/whoobe-cms');

    expect(result.title).toBe('Company Homepage');
    expect(result.slug).toBe('/homepage');
    expect(result.locale).toBe('en');
    expect(result.pimcoreId).toBe('42');

    // Root is a real, empty-of-nothing container tagged 'document' - the
    // same convention every whoobe-one-spike document root already uses
    // (views/Editor.vue's own seeding, database-actions.ts's
    // unwrapDocumentRoot()).
    expect(result.content.type).toBe('container');
    expect(result.content.tag).toBe('document');
    expect(result.content.blocks).toHaveLength(3);

    const headline = result.content.blocks[0];
    expect(headline.element).toBe('h');
    expect(headline.level).toBe(2);
    expect(headline.editable).toBe(true);
    expect(headline.content).toBe('Welcome to Enterprise CMS');

    const image = result.content.blocks[2];
    expect(image.element).toBe('img');
    expect(image.image?.url).toBe('http://localhost:9000/whoobe-cms/logos/hero_banner.png');
    expect(image.image?.alt).toBe('Hero Banner Alt');
  });

  it('preserves the leading slash with no s3Prefix - same real production case/regression this pipeline already guards for the old converter', () => {
    const rawDoc: PimcoreRawDocument = {
      id: 1,
      parentId: 0,
      type: 'page',
      key: 'x',
      path: '/x',
      elements: {
        img: { name: 'img', type: 'image', data: { path: '/communication/hero.jpg' } },
      },
    };
    const result = PimcorePageConverter.convertDocument(rawDoc);
    expect(result.content.blocks[0].image?.url).toBe('/communication/hero.jpg');
  });

  it('converts a nested Areablock into a flex container of its children', () => {
    const rawDoc: PimcoreRawDocument = {
      id: 101,
      parentId: 1,
      type: 'page',
      key: 'features',
      path: '/features',
      title: 'Features Page',
      elements: {
        contentArea: {
          name: 'contentArea',
          type: 'areablock',
          data: [
            { type: 'wysiwyg', data: '<h3>Feature Item 1</h3>' },
            { type: 'image', data: '/features/icon1.png' },
          ],
        },
      },
    };

    const result = PimcorePageConverter.convertDocument(rawDoc);
    const area = result.content.blocks[0];
    expect(area.type).toBe('container');
    expect(area.tag).toBe('flex');
    expect(area.blocks).toHaveLength(2);
    expect(area.blocks[0].element).toBe('p');
    expect(area.blocks[1].element).toBe('img');
  });

  it('converts an unmapped Areablock brick into a generic flex container of its own fields, not a dropped node', () => {
    const rawDoc: PimcoreRawDocument = {
      id: 55,
      parentId: 1,
      type: 'page',
      key: 'promo',
      path: '/promo',
      elements: {
        area: {
          name: 'area',
          type: 'areablock',
          data: [
            {
              brickType: 'totally-unmapped-brick',
              fields: {
                headline: { name: 'headline', type: 'input', data: 'Unmapped Headline' },
              },
            },
          ],
        },
      },
    };

    const result = PimcorePageConverter.convertDocument(rawDoc);
    const brickNode = result.content.blocks[0].blocks[0];
    expect(brickNode.type).toBe('container');
    expect(brickNode.blocks).toHaveLength(1);
    expect(brickNode.blocks[0].content).toBe('Unmapped Headline');
  });

  it('represents a Pimcore data-object relation (href/multihref) as a labeled placeholder, not a silent drop or a fake binding', () => {
    const rawDoc: PimcoreRawDocument = {
      id: 7,
      parentId: 1,
      type: 'page',
      key: 'related',
      path: '/related',
      elements: {
        relatedProduct: { name: 'relatedProduct', type: 'href', data: { id: 999 } },
      },
    };
    const result = PimcorePageConverter.convertDocument(rawDoc);
    expect(result.content.blocks[0].content).toContain('999');
    expect(result.content.blocks[0].content).toContain('not yet supported');
  });
});
