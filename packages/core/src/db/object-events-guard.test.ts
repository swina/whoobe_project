import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// The guard of object-events-phase0.md (step 4): a function that writes the data_objects table without an event, or a second place that
// writes the table at all, fails here, so a new write path cannot silently skip the events.
const here = import.meta.dirname ?? __dirname;
const recordsFile = join(here, 'data-objects-records.ts');
const WRITE = /\.(insert|update|delete)\(dataObjects\)/;

/** Writers that are silent by design, and why. */
const SILENT_BY_DESIGN: Record<string, string> = {
  upsertDataObjectByPimcoreId: 'the Pimcore migration is bulk: the migration tool sends ONE summary with emitBulkSummary',
  syncNonLocalizedAttributes: 'returns the siblings it touched; its callers emit their events inside the same transaction',
};

function topLevelBlocks(src: string): { name: string; body: string }[] {
  return src
    .split(/\n(?=(?:export )?(?:async )?function )/)
    .map((body) => ({ name: /(?:async )?function\s+(\w+)/.exec(body.split('\n').find((l) => /function\s+\w+/.test(l)) ?? '')?.[1] ?? '', body }))
    .filter((b) => b.name);
}

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|vue)$/.test(name) && !/\.test\./.test(name)) yield full;
  }
}

describe('object events: every write of data_objects emits or is explicitly silent', () => {
  const blocks = topLevelBlocks(readFileSync(recordsFile, 'utf8'));
  const writers = blocks.filter((b) => WRITE.test(b.body));

  it('finds the known writers (the scan itself works)', () => {
    expect(writers.map((w) => w.name).sort()).toEqual(
      ['bulkImportDataObjects', 'createDataObject', 'deleteDataObject', 'deleteDataObjectsByClassId', 'syncNonLocalizedAttributes', 'updateDataObject', 'upsertDataObjectByPimcoreId'],
    );
  });

  it.each(writers.map((w) => [w.name, w.body] as const))('%s emits an event or is silent by design', (name, body) => {
    if (SILENT_BY_DESIGN[name]) return;
    expect(/insertEvent\(|emitUpdateEvents\(/.test(body), `${name} writes data_objects without an object event`).toBe(true);
    expect(/db\.transaction\(/.test(body), `${name} must write the data and the event in one transaction`).toBe(true);
  });

  it('no other file writes the data_objects table', () => {
    const root = resolve(here, '../../../..');
    const offenders: string[] = [];
    for (const base of ['packages', 'apps']) {
      for (const file of sourceFiles(join(root, base))) {
        if (file === recordsFile) continue;
        if (WRITE.test(readFileSync(file, 'utf8'))) offenders.push(relative(root, file));
      }
    }
    expect(offenders, 'a second writer of data_objects must emit events too: use data-objects-records.ts').toEqual([]);
  });
});
