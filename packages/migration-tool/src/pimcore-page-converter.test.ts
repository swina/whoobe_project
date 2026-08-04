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
      path: '/',
      title: 'Company Homepage',
      elements: {
        headline: { name: 'headline', type: 'input', data: 'Welcome to Enterprise CMS' },
        mainContent: { name: 'mainContent', type: 'wysiwyg', data: '<p>Migrated from Pimcore legacy PHP monolith.</p>' },
        heroBanner: { name: 'heroBanner', type: 'image', data: { path: '/logos/hero_banner.png', alt: 'Hero Banner Alt' } },
      },
    };

    const result = PimcorePageConverter.convertDocument(rawDoc, 'http://localhost:9000/whoobe-cms');

    expect(result.title).toBe('Company Homepage');
    // `path` is the PARENT's path in real Pimcore ('/' here, the root) -
    // the document's own slug is `path` + its own `key`, not `path` alone
    // (see resolveDocumentSlug's own comment - a real bug this pipeline
    // had until Phase 5's pilot against a live install surfaced it).
    expect(result.slug).toBe('/homepage/');
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
      path: '/',
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
      path: '/',
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
      path: '/',
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

  it('composes the slug from the parent path plus this document\'s own key, not the parent path alone - regression for a real collision Phase 5\'s pilot hit against a live multi-level Pimcore site', () => {
    // Real shape observed: document 13 (key 'it') has path '/', and its
    // children (e.g. document 10, key 'area-comunicazione') all report
    // path '/it/' - `path` is where the parent lives, not this document's
    // own slug. Using `path` alone previously gave every child of the same
    // parent an identical, colliding slug ('/it/').
    const child = PimcorePageConverter.convertDocument({
      id: 10,
      parentId: 13,
      type: 'page',
      key: 'area-comunicazione',
      path: '/it/',
      elements: {},
    });
    expect(child.slug).toBe('/it/area-comunicazione/');

    const root = PimcorePageConverter.convertDocument({
      id: 1,
      parentId: 0,
      type: 'page',
      key: '',
      path: '/',
      elements: {},
    });
    expect(root.slug).toBe('/');
  });

  it('represents a Pimcore data-object relation (href/multihref) as a labeled placeholder, not a silent drop or a fake binding', () => {
    const rawDoc: PimcoreRawDocument = {
      id: 7,
      parentId: 1,
      type: 'page',
      key: 'related',
      path: '/',
      elements: {
        relatedProduct: { name: 'relatedProduct', type: 'href', data: { id: 999 } },
      },
    };
    const result = PimcorePageConverter.convertDocument(rawDoc);
    expect(result.content.blocks[0].content).toContain('999');
    expect(result.content.blocks[0].content).toContain('not yet supported');
  });
});
