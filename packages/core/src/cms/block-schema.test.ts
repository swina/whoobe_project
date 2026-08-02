import { describe, it, expect } from 'vitest';
import {
  WhoobeBlockNodeSchema,
  WhoobeDocumentLayoutSchema,
  validateWhoobeDocument,
  createEmptyWhoobeDocument,
  createHeroBannerPreset,
  createFeatureGridPreset,
} from './block-schema.js';

describe('Whoobe Block Schemas & Presets (Phase 4)', () => {
  it('validates a correct Whoobe block node structure', () => {
    const node = {
      id: 'block_1',
      type: 'container',
      name: 'Main Container',
      tag: 'div',
      style: { color: 'red' },
      children: [
        {
          id: 'block_2',
          type: 'typography',
          name: 'Heading',
          content: 'Hello World',
        },
      ],
    };

    const parsed = WhoobeBlockNodeSchema.parse(node);
    expect(parsed.id).toBe('block_1');
    expect(parsed.children).toHaveLength(1);
    expect(parsed.children![0].content).toBe('Hello World');
  });

  it('creates empty Whoobe document and validates layout schema', () => {
    const doc = createEmptyWhoobeDocument('About Us', '/about');
    expect(doc.title).toBe('About Us');
    expect(doc.slug).toBe('/about');
    expect(doc.rootBlock.children).toHaveLength(0);

    const validated = validateWhoobeDocument(doc);
    expect(validated.id).toBe(doc.id);
  });

  it('creates Hero Banner preset node with children', () => {
    const hero = createHeroBannerPreset('Welcome to Whoobe', 'The Next Generation CMS', 'https://example.com/banner.png');
    expect(hero.type).toBe('container');
    expect(hero.children).toHaveLength(3); // Title, Subtitle, Image
    expect(hero.children![0].content).toBe('Welcome to Whoobe');
  });

  it('creates Feature Grid preset node', () => {
    const grid = createFeatureGridPreset([
      { title: 'Speed', description: 'Built with Vite and Sharp' },
      { title: 'Flexibility', description: 'Hybrid EAV and S3 DAM' },
    ]);

    expect(grid.type).toBe('grid');
    expect(grid.children).toHaveLength(2);
    expect(grid.children![0].children![0].content).toBe('Speed');
  });
});
