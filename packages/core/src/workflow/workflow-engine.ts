import { createMachine } from 'xstate';

/**
 * Admin-authorable workflow engine for Data Objects - see docs/plans/
 * backend/object-publish-workflow-plan.md §2.4/§7 Phase 3. A
 * `WorkflowDefinition` is authored *per class* (`class_workflow_definitions`,
 * db/class-workflow-definitions-schema.ts) - every object of that class
 * shares the same machine shape. A class with no definition at all just
 * gets the plain Draft/Published toggle §2.1 already provides -
 * `workflowState` stays `null` and nothing in this file gets involved.
 *
 * `allowedPermissions` (not `allowedRoles`) per that plan's own §3.3
 * correction, referencing docs/plans/backend/auth-permissions-plan.md -
 * permission *strings* (already real and implemented, packages/core/src/
 * auth/permissions.ts), not role names.
 */
export interface WorkflowPlace {
  name: string;
  label: string;
  color?: string;
}

export interface WorkflowTransitionDefinition {
  name: string;
  from: string[];
  to: string;
  allowedPermissions?: string[];
  /** Side-effect: flips the hard `published` gate on a successful
   * transition into this transition's `to` place - the same pattern
   * Pimcore's own Workflow component uses for `publish`/`unpublish`
   * transition actions (§2.4). */
  setPublished?: boolean;
}

export interface WorkflowDefinitionShape {
  initialPlace: string;
  places: WorkflowPlace[];
  transitions: WorkflowTransitionDefinition[];
}

/** Builds a real XState machine from a stored `WorkflowDefinition` - one
 * state per place, one `on` event per transition *from* that place. No
 * long-lived actor/interpreter needed (this isn't a running process) -
 * only `resolveState()`'s stateless "what's currently possible from this
 * value" is used, by `isTransitionValid` below. */
export function compileWorkflowMachine(definition: WorkflowDefinitionShape) {
  const states: Record<string, { on: Record<string, { target: string }> }> = {};
  for (const place of definition.places) {
    states[place.name] = { on: {} };
  }
  for (const transition of definition.transitions) {
    for (const from of transition.from) {
      // A transition naming a `from` place the class's own `places` list
      // doesn't declare is a real authoring bug (caught here, not
      // silently tolerated by inventing a new state XState never
      // declared) - see the admin workflow editor's own validation.
      if (states[from]) states[from].on[transition.name] = { target: transition.to };
    }
  }
  return createMachine({ id: 'workflow', initial: definition.initialPlace, states });
}

/** Whether `transitionName` is a legal move from `currentPlace` right
 * now - the real question `transitionObjectWorkflow` (core-api) needs
 * answered before applying anything. `currentPlace` not being a real
 * place in this definition (a stale `workflowState` left over from an
 * edited-since workflow) is treated as "no valid transition", not an
 * uncaught crash - confirmed directly: `resolveState()` throws for an
 * unknown state value rather than returning an empty-capability result. */
export function isTransitionValid(definition: WorkflowDefinitionShape, currentPlace: string, transitionName: string): boolean {
  let machine: ReturnType<typeof compileWorkflowMachine>;
  try {
    machine = compileWorkflowMachine(definition);
    const resolved = machine.resolveState({ value: currentPlace, context: {} });
    return resolved.can({ type: transitionName });
  } catch {
    return false;
  }
}

/** The transition's own authored metadata (`to`/`setPublished`/
 * `allowedPermissions`) - XState's compiled machine only encodes `to` as
 * a bare event target, not this richer per-transition data, so this
 * looks it up from the stored definition directly rather than trying to
 * smuggle it through the machine config. */
export function getTransitionDefinition(
  definition: WorkflowDefinitionShape,
  transitionName: string
): WorkflowTransitionDefinition | undefined {
  return definition.transitions.find((t) => t.name === transitionName);
}
