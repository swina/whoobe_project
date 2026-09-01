import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listDataClasses, getDataClassByName, updateDataClass, createDataComponent, getDataComponentByName, listDataComponents, deleteDataComponent } from '@whoobe-cms/core/server';
import type { ClassFieldDefinition } from '@whoobe-cms/core';
import type { MigrationRunResult } from './cli.js';
import { parseAllowedTypes, parseFieldCollectionTypeFile } from './pimcore-class-definition-parser.js';

export interface ExtractCollectionTypesOptions {
  dryRun?: boolean;
  className?: string;
  clear?: boolean;
  classesDir?: string;
}

export async function runExtractCollectionTypes(
  options: ExtractCollectionTypesOptions = {}
): Promise<MigrationRunResult> {
  const { dryRun = false, className, clear = false, classesDir } = options;
  console.log(`[extract-collection-types] Starting${dryRun ? ' (dry run - no writes)' : ''}`);

  const classes = className
    ? await getDataClassByName(className).then((c) => (c ? [c] : []))
    : await listDataClasses();

  if (classes.length === 0) {
    console.log('[extract-collection-types] No classes found.');
    return { succeeded: 0, failed: 0, errors: [] };
  }
  console.log(`[extract-collection-types] Found ${classes.length} data class(es).`);

  // When classesDir is provided, re-populate collectionTypes from Pimcore files
  // for fields that have allowedComponentTypes but no embedded collectionTypes.
  if (classesDir) {
    for (const dataClass of classes) {
      let changed = false;
      const updated = dataClass.fields.map((field) => {
        if (field.fieldType !== 'fieldcollections') return field;
        if (field.collectionTypes?.length) return field;
        if (!field.allowedComponentTypes?.length) return field;

        const collectionTypes: NonNullable<ClassFieldDefinition['collectionTypes']> = [];
        for (const typeName of field.allowedComponentTypes) {
          try {
            const typeSource = readFileSync(
              join(classesDir, 'DataObject', 'Fieldcollection', 'Data', `${typeName}.php`),
              'utf-8'
            );
            collectionTypes.push({ name: typeName, label: typeName, fields: parseFieldCollectionTypeFile(typeSource) });
            console.log(`[extract-collection-types] Read Pimcore definition for component "${typeName}".`);
          } catch (err: any) {
            console.warn(`[extract-collection-types] Could not read Pimcore definition for "${typeName}": ${err.message}`);
          }
        }
        if (collectionTypes.length > 0) {
          changed = true;
          return { ...field, collectionTypes };
        }
        return field;
      });
      if (changed && !dryRun) {
        await updateDataClass(dataClass.id, { fields: updated });
        console.log(`[extract-collection-types] Re-populated collectionTypes for class "${dataClass.name}" from Pimcore files.`);
      }
    }
    // Re-fetch classes after populating collectionTypes
    const freshClasses = className
      ? await getDataClassByName(className).then((c) => (c ? [c] : []))
      : await listDataClasses();
    for (const dataClass of freshClasses) {
      for (const field of dataClass.fields) {
        if (field.fieldType === 'fieldcollections' && field.collectionTypes?.length) {
          console.log(`[extract-collection-types] Class "${dataClass.name}" field "${field.name}": ${field.collectionTypes.length} collection type(s) available.`);
        }
      }
    }
  }

  const allCollectionTypes: { name: string; label: string; fields: ClassFieldDefinition[] }[] = [];
  const classFieldMap: { classId: string; className: string; fieldName: string; collectionTypes: typeof allCollectionTypes }[] = [];

  // Re-read classes to pick up any collectionTypes that were just populated
  const scanClasses = classesDir
    ? (className
        ? await getDataClassByName(className).then((c) => (c ? [c] : []))
        : await listDataClasses())
    : classes;

  for (const dataClass of scanClasses) {
    for (const field of dataClass.fields) {
      if (field.fieldType === 'fieldcollections' && field.collectionTypes?.length) {
        classFieldMap.push({
          classId: dataClass.id,
          className: dataClass.name,
          fieldName: field.name,
          collectionTypes: field.collectionTypes,
        });
        for (const ct of field.collectionTypes) {
          if (!allCollectionTypes.some((e) => e.name === ct.name)) {
            allCollectionTypes.push(ct);
          }
        }
      }
    }
  }

  if (clear) {
    const existing = await listDataComponents();
    if (existing.length > 0) {
      console.log(`[extract-collection-types] Clearing all ${existing.length} existing component(s)...`);
      for (const comp of existing) {
        if (dryRun) {
          console.log(`[dry-run] Would delete component "${comp.name}".`);
        } else {
          await deleteDataComponent(comp.id);
          console.log(`[extract-collection-types] Deleted component "${comp.name}".`);
        }
      }
    } else {
      console.log(`[extract-collection-types] Clear requested but no components exist.`);
    }
  }

  if (allCollectionTypes.length === 0) {
    console.log('[extract-collection-types] No collectionTypes found to extract.');
    if (classesDir) {
      console.log('[extract-collection-types] Tried reading from Pimcore class files at:', classesDir);
    }
    return { succeeded: 0, failed: 0, errors: [] };
  }

  console.log(`[extract-collection-types] Found ${allCollectionTypes.length} unique collection type(s) across ${classFieldMap.length} field(s).`);

  const componentRefs: Record<string, { className: string; fieldName: string }[]> = {};
  for (const entry of classFieldMap) {
    for (const ct of entry.collectionTypes) {
      if (!componentRefs[ct.name]) componentRefs[ct.name] = [];
      componentRefs[ct.name].push({ className: entry.className, fieldName: entry.fieldName });
    }
  }
  for (const [name, refs] of Object.entries(componentRefs)) {
    console.log(`[extract-collection-types]   Component "${name}" referenced by:`);
    for (const ref of refs) {
      console.log(`[extract-collection-types]     - ${ref.className}.${ref.fieldName}`);
    }
  }

  let succeeded = 0;
  const errors: { item: string; message: string }[] = [];

  for (const ct of allCollectionTypes) {
    try {
      const existing = await getDataComponentByName(ct.name);
      if (existing) {
        console.log(`[extract-collection-types] Component "${ct.name}" already exists, reusing.`);
      } else if (dryRun) {
        console.log(`[dry-run] Would create component "${ct.name}" with ${ct.fields.length} field(s).`);
      } else {
        await createDataComponent({ name: ct.name, label: ct.label, fields: ct.fields });
        console.log(`[extract-collection-types] Created component "${ct.name}" with ${ct.fields.length} field(s).`);
      }
      succeeded++;
    } catch (err: any) {
      errors.push({ item: ct.name, message: err.message });
      console.error(`[extract-collection-types] Failed to create component "${ct.name}": ${err.message}`);
    }
  }

  for (const entry of classFieldMap) {
    try {
      const dataClass = await getDataClassByName(entry.className);
      if (!dataClass) {
        errors.push({ item: `${entry.className}.${entry.fieldName}`, message: 'Class not found' });
        continue;
      }

      const updatedFields = dataClass.fields.map((f) => {
        if (f.name === entry.fieldName && f.fieldType === 'fieldcollections') {
          const allowedComponentTypes = entry.collectionTypes.map((ct) => ct.name);
          return { ...f, allowedComponentTypes };
        }
        return f;
      });

      if (dryRun) {
        console.log(`[dry-run] Would update class "${entry.className}" field "${entry.fieldName}": add allowedComponentTypes.`);
      } else {
        await updateDataClass(entry.classId, { fields: updatedFields });
        console.log(`[extract-collection-types] Updated class "${entry.className}" field "${entry.fieldName}" with allowedComponentTypes.`);
      }
    } catch (err: any) {
      errors.push({ item: `${entry.className}.${entry.fieldName}`, message: err.message });
      console.error(`[extract-collection-types] Failed to update class "${entry.className}": ${err.message}`);
    }
  }

  console.log(`[extract-collection-types] Done. ${succeeded} component(s) created, ${errors.length} error(s).`);
  return { succeeded, failed: errors.length, errors };
}