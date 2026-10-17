# Draft is never public

## Decision
Every Data Object has two independent states: `published` (a hard on/off gate) and an optional `workflowState` (an editorial place such as
"in review"). **The public surface can only return published objects**, and it does so through **one shared function**, not through a filter that each
route remembers to add. Publishing needs its own permission. Sharing a draft with someone outside is done with a **temporary preview link** for one
object, not by opening the draft.

## Why
- **A forgotten filter is a data leak.** If each public route re-implements "only published", one omission exposes drafts. A single shared query
  makes the rule reviewable in one place and testable.
- **Same answer for "does not exist" and "is a draft".** The public API returns an identical `404`, so it never reveals that an unpublished object exists.
- **Editorial flow without exposure.** Keeping `workflowState` separate from `published` lets an object stay public while a new revision is being
  reviewed, and lets a class with no workflow still have simple draft/published.
- **The same rule for new surfaces.** The Client Hub reads data through the same published-only query and returns only the fields the class defines.

## What it costs
- **No "scheduled" or "per-audience" visibility.** An object is published or not; time-based or audience-based publishing is not built in.
- **Drafts are not versioned beside the published version.** An edit to a published object is live on save unless a workflow is used to hold it back.

## When to revisit
When scheduled publishing or per-audience visibility is required.

## Where it shows in the product
[Data model](../../data/data-model.md), [API clients guide](../../communication/api-clients.md) (section 6.2), plan
[`object-publish-workflow-plan.md`](https://github.com/swina/whoobe_project/blob/master/docs/plans/backend/object-publish-workflow-plan.md).
