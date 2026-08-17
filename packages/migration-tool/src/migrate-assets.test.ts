import { describe, it, expect } from 'vitest';
import { createPimcoreSourceAdapter } from './source-adapter.js';
import { runAssetMigration } from './cli.js';
import type { FixturePimcoreDataset } from './adapters/fixture-adapter.js';
import './adapters/fixture-adapter.js';

/**
 * Test-only PHP serializer (the mirror image of php-unserialize.ts) - same
 * helper the existing pipeline tests already use, needed here to build real
 * Image/Video editable rows without hand-counting byte lengths.
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

function makeDataset(): FixturePimcoreDataset {
  return {
    documents: [
      { id: 1, parentId: 0, type: 'page', key: 'home', path: '/', title: 'Home' },
      { id: 2, parentId: 1, type: 'page', key: 'contact', path: '/', title: 'Contact' },
    ],
    assetPathsById: {
      42: '/communication/Visore_2023.jpg',
      43: '/logos/brand.png',
      44: '/videos/hero.mp4',
    },
    elementRowsByDocumentId: {
      // Home: a top-level image + a video editable.
      1: [
        { documentId: 1, name: 'hero_image', type: 'image', data: phpSerialize({ id: 42, alt: 'Visore' }) },
        { documentId: 1, name: 'hero_video', type: 'video', data: phpSerialize({ id: 44 }) },
      ],
      // Contact: an image nested inside an areablock brick field.
      2: [
        {
          documentId: 2,
          name: 'content',
          type: 'areablock',
          data: phpSerialize([{ key: '9', type: 'header-brick', hidden: false }]),
        },
        {
          documentId: 2,
          name: 'content:9.header_image',
          type: 'image',
          data: phpSerialize({ id: 43, alt: 'Brand' }),
        },
      ],
    },
    assets: [
      { id: 42, path: '/communication/Visore_2023.jpg', filename: 'Visore_2023.jpg', type: 'image', mimetype: 'image/jpeg', data: 'Visore_2023.jpg' },
      { id: 43, path: '/logos/brand.png', filename: 'brand.png', type: 'image', mimetype: 'image/png', data: 'brand.png' },
      { id: 44, path: '/videos/hero.mp4', filename: 'hero.mp4', type: 'video', mimetype: 'video/mp4', data: 'hero.mp4' },
    ],
    assetBytesByPath: {
      '/communication/Visore_2023.jpg': Buffer.from('jpeg-bytes'),
      '/logos/brand.png': Buffer.from('png-bytes'),
      '/videos/hero.mp4': Buffer.from('mp4-bytes'),
    },
  };
}

describe('migrate-assets (documents-migration plan Phase 1)', () => {
  it('collects the assets documents reference - including fields nested inside areablock bricks', async () => {
    const result = await runAssetMigration({
      source: 'fixture',
      sourceConfig: { dataset: makeDataset() },
      dryRun: true,
    });

    // All three unique referenced paths are found (the top-level image/video
    // on doc 1, and the brick-nested image on doc 2).
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
  });

  it('reports a referenced path missing from the source assets table as a failure, not a crash', async () => {
    const dataset = makeDataset();
    // Document 1 references asset 42, but the source catalogue no longer has
    // it (deleted at the source) - runAssetMigration must survive it.
    dataset.assets = dataset.assets!.filter((a) => a.path !== '/communication/Visore_2023.jpg');

    const result = await runAssetMigration({
      source: 'fixture',
      sourceConfig: { dataset },
      dryRun: true,
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0].item).toBe('/communication/Visore_2023.jpg');
    expect(result.errors[0].message).toContain('missing');
  });

  it('reports an asset whose file bytes are unreadable as a failure, not a crash', async () => {
    const dataset = makeDataset();
    // Bytes present in the catalogue row but no file on disk.
    delete dataset.assetBytesByPath!['/videos/hero.mp4'];

    const result = await runAssetMigration({
      source: 'fixture',
      sourceConfig: { dataset },
      dryRun: true,
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0].item).toBe('/videos/hero.mp4');
  });

  it('does not include assets the documents never reference', async () => {
    const dataset = makeDataset();
    dataset.assets = [
      ...dataset.assets!,
      { id: 99, path: '/unused/secret.jpg', filename: 'secret.jpg', type: 'image', mimetype: 'image/jpeg', data: 'secret.jpg' },
    ];

    const result = await runAssetMigration({
      source: 'fixture',
      sourceConfig: { dataset },
      dryRun: true,
    });

    // Only the 3 referenced ones are migrated, never the unreferenced 99.
    expect(result.succeeded).toBe(3);
  });
});
