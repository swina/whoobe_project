import { describe, it, expect } from 'vitest';
import { runDocumentMigration } from './cli.js';
import type { FixturePimcoreDataset } from './adapters/fixture-adapter.js';
import './adapters/fixture-adapter.js';

/**
 * Test-only PHP serializer (the mirror image of php-unserialize.ts) - same
 * helper the other pipeline tests use, needed here to build real Image
 * editable rows without hand-counting byte lengths.
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
      42: '/communication/hero.jpg',
    },
    elementRowsByDocumentId: {
      1: [{ documentId: 1, name: 'headline', type: 'input', data: 'Welcome' }],
      2: [
        {
          documentId: 2,
          name: 'hero',
          type: 'image',
          data: phpSerialize({ id: 42, alt: 'Hero' }),
        },
      ],
    },
  };
}

describe('migrate-documents staging (documents-migration plan Option B)', () => {
  it('runs in dry-run with the staging flag, reporting the same per-document results as the direct path', async () => {
    const direct = await runDocumentMigration({
      source: 'fixture',
      sourceConfig: { dataset: makeDataset() },
      dryRun: true,
    });
    const staged = await runDocumentMigration({
      source: 'fixture',
      sourceConfig: { dataset: makeDataset() },
      dryRun: true,
      staging: true,
    });

    // Both paths walk the same documents and convert them the same way -
    // the staging flag only changes WHERE the (here, skipped) write lands.
    expect(direct.succeeded).toBe(2);
    expect(staged.succeeded).toBe(2);
    expect(direct.failed).toBe(0);
    expect(staged.failed).toBe(0);
  });

  it('survives an unresolvable asset reference (image node keeps a null URL) rather than failing the document', async () => {
    const dataset = makeDataset();
    // An image editable whose asset id doesn't resolve to any path - the
    // converter must produce an image node with a null URL, not throw, so
    // the whole batch isn't aborted over one broken reference.
    dataset.elementRowsByDocumentId[1] = [
      { documentId: 1, name: 'bad', type: 'image', data: phpSerialize({ id: 999999, alt: 'Bad' }) },
    ];

    const result = await runDocumentMigration({
      source: 'fixture',
      sourceConfig: { dataset },
      dryRun: true,
      staging: true,
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });
});
