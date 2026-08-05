import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { classWorkflowDefinitions } from './class-workflow-definitions-schema.js';
import type { WorkflowPlace, WorkflowTransitionDefinition } from '../workflow/workflow-engine.js';

export interface ClassWorkflowDefinitionRecord {
  id: string;
  classId: string;
  initialPlace: string;
  places: WorkflowPlace[];
  transitions: WorkflowTransitionDefinition[];
  createdAt: Date;
  updatedAt: Date;
}

export async function getWorkflowDefinitionByClassId(classId: string): Promise<ClassWorkflowDefinitionRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(classWorkflowDefinitions).where(eq(classWorkflowDefinitions.classId, classId)).limit(1);
  return row ?? null;
}

/** Insert-or-replace for one class's workflow - authoring a workflow is a
 * "define the whole thing" action (the admin editor always submits the
 * complete places/transitions list, §5), not an incremental patch, so
 * upsert-by-classId (via the table's own unique index) is simpler and
 * more honest than a separate create/update pair here. */
export async function upsertWorkflowDefinition(input: {
  classId: string;
  initialPlace: string;
  places: WorkflowPlace[];
  transitions: WorkflowTransitionDefinition[];
}): Promise<ClassWorkflowDefinitionRecord> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(classWorkflowDefinitions)
    .values({
      classId: input.classId,
      initialPlace: input.initialPlace,
      places: input.places,
      transitions: input.transitions,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: classWorkflowDefinitions.classId,
      set: {
        initialPlace: input.initialPlace,
        places: input.places,
        transitions: input.transitions,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

export async function deleteWorkflowDefinition(classId: string): Promise<void> {
  const db = getDb();
  await db.delete(classWorkflowDefinitions).where(eq(classWorkflowDefinitions.classId, classId));
}
