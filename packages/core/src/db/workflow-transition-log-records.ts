import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { workflowTransitionLog } from './workflow-transition-log-schema.js';

export interface WorkflowTransitionLogRecord {
  id: string;
  objectId: string;
  fromPlace: string | null;
  toPlace: string;
  transitionName: string;
  actorId: string | null;
  occurredAt: Date;
  note: string | null;
}

export async function logWorkflowTransition(input: {
  objectId: string;
  fromPlace: string | null;
  toPlace: string;
  transitionName: string;
  actorId?: string | null;
  note?: string | null;
}): Promise<WorkflowTransitionLogRecord> {
  const db = getDb();
  const [row] = await db
    .insert(workflowTransitionLog)
    .values({
      objectId: input.objectId,
      fromPlace: input.fromPlace,
      toPlace: input.toPlace,
      transitionName: input.transitionName,
      actorId: input.actorId ?? null,
      note: input.note ?? null,
    })
    .returning();
  return row;
}

export async function listWorkflowTransitionsForObject(objectId: string): Promise<WorkflowTransitionLogRecord[]> {
  const db = getDb();
  return db
    .select()
    .from(workflowTransitionLog)
    .where(eq(workflowTransitionLog.objectId, objectId))
    .orderBy(desc(workflowTransitionLog.occurredAt));
}
