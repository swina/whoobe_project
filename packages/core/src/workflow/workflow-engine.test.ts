import { describe, it, expect } from 'vitest';
import { isTransitionValid, getTransitionDefinition, type WorkflowDefinitionShape } from './workflow-engine.js';

const definition: WorkflowDefinitionShape = {
  initialPlace: 'draft',
  places: [
    { name: 'draft', label: 'Draft' },
    { name: 'in_review', label: 'In Review' },
    { name: 'approved', label: 'Approved' },
  ],
  transitions: [
    { name: 'submit', from: ['draft'], to: 'in_review' },
    { name: 'approve', from: ['in_review'], to: 'approved', setPublished: true, allowedPermissions: ['objects:publish'] },
    { name: 'reject', from: ['in_review'], to: 'draft' },
    { name: 'retract', from: ['approved'], to: 'draft', setPublished: false },
  ],
};

describe('workflow-engine (docs/plans/backend/object-publish-workflow-plan.md §2.4, Phase 5)', () => {
  it('allows a transition declared from the current place', () => {
    expect(isTransitionValid(definition, 'draft', 'submit')).toBe(true);
    expect(isTransitionValid(definition, 'in_review', 'approve')).toBe(true);
  });

  it('rejects a transition not declared from the current place', () => {
    expect(isTransitionValid(definition, 'draft', 'approve')).toBe(false);
    expect(isTransitionValid(definition, 'approved', 'submit')).toBe(false);
  });

  it('rejects a transition name that does not exist anywhere in the definition', () => {
    expect(isTransitionValid(definition, 'draft', 'made-up-transition')).toBe(false);
  });

  it('treats a stale/unknown current place as no valid transition, not a crash', () => {
    expect(isTransitionValid(definition, 'a-place-removed-since-this-object-last-transitioned', 'submit')).toBe(false);
  });

  it('looks up a transition\'s own setPublished/allowedPermissions metadata by name', () => {
    const approve = getTransitionDefinition(definition, 'approve');
    expect(approve?.to).toBe('approved');
    expect(approve?.setPublished).toBe(true);
    expect(approve?.allowedPermissions).toEqual(['objects:publish']);

    const retract = getTransitionDefinition(definition, 'retract');
    expect(retract?.setPublished).toBe(false);
  });
});
