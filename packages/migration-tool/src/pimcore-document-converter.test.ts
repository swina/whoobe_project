import { describe, it, expect } from 'vitest';
import { PimcoreDocumentConverter, PimcoreRawDocument } from './pimcore-document-converter.js';

describe('Pimcore Document & Areablock Converter (Phase 6)', () => {
  it('converts a basic Pimcore raw document to Whoobe document layout', () => {
    const rawDoc: PimcoreRawDocument = {
      id: 42,
      parentId: 1,
      type: 'page',
      key: 'homepage',
      path: '/homepage',
      title: 'Company Homepage',
      elements: {
        headline: {
          name: 'headline',
          type: 'input',
          data: 'Welcome to Enterprise CMS',
        },
        mainContent: {
          name: 'mainContent',
          type: 'wysiwyg',
          data: '<p>Migrated from Pimcore legacy PHP monolith.</p>',
        },
        heroBanner: {
          name: 'heroBanner',
          type: 'image',
          data: { path: '/logos/hero_banner.png', alt: 'Hero Banner Alt' },
        },
      },
    };

    const result = PimcoreDocumentConverter.convertDocument(rawDoc, 'http://localhost:9000/whoobe-cms');

    expect(result.id).toBe('doc_42');
    expect(result.title).toBe('Company Homepage');
    expect(result.slug).toBe('/homepage');
    expect(result.rootBlock.children).toHaveLength(3);

    // Verify input editable conversion
    const headlineBlock = result.rootBlock.children![0];
    expect(headlineBlock.type).toBe('typography');
    expect(headlineBlock.tag).toBe('h2');
    expect(headlineBlock.content).toBe('Welcome to Enterprise CMS');

    // Verify image editable conversion
    const imageBlock = result.rootBlock.children![2];
    expect(imageBlock.type).toBe('media');
    expect(imageBlock.props?.src).toBe('http://localhost:9000/whoobe-cms/logos/hero_banner.png');
    expect(imageBlock.props?.s3Key).toBe('logos/hero_banner.png');
  });

  it('converts nested Pimcore Areablock editables to hierarchical Whoobe block nodes', () => {
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
            {
              type: 'wysiwyg',
              data: '<h3>Feature Item 1</h3>',
            },
            {
              type: 'image',
              data: '/features/icon1.png',
            },
          ],
        },
      },
    };

    const result = PimcoreDocumentConverter.convertDocument(rawDoc);

    const areaBlock = result.rootBlock.children![0];
    expect(areaBlock.type).toBe('areablock');
    expect(areaBlock.children).toHaveLength(2);
    expect(areaBlock.children![0].type).toBe('typography');
    expect(areaBlock.children![1].type).toBe('media');
  });
});
