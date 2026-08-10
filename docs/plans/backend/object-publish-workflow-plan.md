# Plan: Object Draft/Published State & Admin-Configurable Workflows

Planning document for two related backend features: (1) a Draft/Published lifecycle gate on Data Objects that controls public API visibility, and (2) an admin-authorable workflow (state machine) layered on top of it. No code has been written yet — this defines the data model, API surface, and rollout sequence before implementation starts.

---

## 1. Scope

This plan covers **Data Objects** — the PIM/MDM entities described in `Initial-Plan.md` §3.2.1 and surfaced today as the (currently mock) `/objects` section (`apps/admin-dashboard/src/views/ObjectsView.vue`), backed by the placeholder `BaseDataObject` interface in `packages/core/src/db/schema.ts` and `ClassDefinition` in `packages/core/src/schema/dynamic.ts`.

> [!IMPORTANT]
> - **Documents**: the identical mechanism (same fields, same API gate, same workflow engine) is designed to extend to Documents with no structural changes. Treated as a fast-follow, not this plan's core deliverable — see §7 Phase 5.
> - **Assets are explicitly out of scope.** DAM assets already have an orthogonal *visibility* mechanism (the folder-based public/private ACL built for S3/MinIO — see `docs/DAM_implementation_plan.md`). That controls network-level access (signed URL vs. direct CDN link); this plan's Draft/Published state is an *editorial lifecycle* gate on API queries. The two are different axes and should not be merged.
> - **No auth/permissions system exists in this codebase yet** (confirmed: no session/JWT/role code anywhere in `packages/core` or `apps/*`; the "Admin User" in `DashboardLayout.vue` is a hardcoded display, not a real identity). Anything below that says "admin-only" or `allowedRoles` assumes an auth system will land before these gates are enforced for real — see §6.
> - **This dependency is now its own plan and comes first**: see `docs/plans/backend/auth-permissions-plan.md`. That plan's §3.3 also corrects `WorkflowTransition.allowedRoles` (below, §2.4) to `allowedPermissions` — permission-string checks rather than role-name checks — which should be treated as the current design, not the `allowedRoles` naming still shown here.

---

## 2. Core Concepts

### 2.1 Publish State — the hard gate

Two orthogonal pieces of state live on every object:

| Field | Type | Meaning |
|---|---|---|
| `published` | `boolean` | Hard gate. `true` → visible via the public API. `false` → visible only via the backend/admin API or a preview link. |
| `workflowState` | `string \| null` | Current place in the object's class-defined workflow, if the class has one configured. Editorial/organizational only — it does **not** itself gate public API visibility except through an explicit transition side-effect (§2.4). |

Keeping these separate matters: an object can stay `published = true` while its workflow keeps moving through post-publish places (e.g. `published` → `needs_update` → `published` again) without losing public visibility mid-edit. It also means a class with **no workflow configured at all** still gets simple Draft/Published toggling for free — the common case doesn't require authoring a workflow.

### 2.2 Public API visibility rule

- **Public API** (used by public-facing frontends consuming this CMS's content): every query/resolver for Data Objects filters `WHERE published = true`. This must be enforced in one shared place — a `publicObjectsQuery()` helper exported from `@whoobe-cms/core` — not left to each resolver to remember individually. A forgotten filter in one resolver is a real data leak; centralizing it removes that failure mode.
- **Backend/admin API** (used by `apps/admin-dashboard`): no such filter. Authenticated admin/editor identities can read and write objects in any state.
- Rule of thumb for review: any new query that touches Data Objects and is reachable by the public API must go through `publicObjectsQuery()` or be rejected in code review.

### 2.3 Preview Links (public, scoped, temporary)

For sharing a draft with someone who isn't logged into the CMS:

- `POST /api/v1/objects/:id/preview-link` (admin-only) issues a token scoped to that specific object (optionally a specific revision, once versioning exists), with an expiry (default 7 days, admin-adjustable per link).
- `GET /preview/objects/:token` (public, unauthenticated, **not** part of the GraphQL public schema — a separate route) resolves the token, loads the object regardless of `published`, and renders it read-only. No write access, no ability to enumerate or discover other drafts.
- Links are revocable and logged (who generated it, when, how many times it was resolved), for auditability.
- This mirrors Pimcore's own shared-preview-link pattern for unpublished documents/objects — a proven approach worth reusing rather than reinventing.

### 2.4 Workflow Engine

- Powered by **XState**, matching the direction already stated in `Initial-Plan.md` ("Workflow State Machine: Complex product approval workflows powered by XState").
- A `WorkflowDefinition` is authored **per class**, not per object — every object of a class shares the same machine shape:

  ```ts
  interface WorkflowPlace {
    name: string;            // e.g. 'draft', 'in_review', 'approved'
    label: string;           // admin-facing display label
    color?: string;
  }

  interface WorkflowTransition {
    name: string;            // e.g. 'submit_for_review'
    from: string[];          // allowed source place(s)
    to: string;              // destination place
    allowedRoles?: string[]; // who may trigger this transition (see §6 on auth dependency)
    setPublished?: boolean;  // side-effect: flips the hard gate on successful transition
  }

  interface WorkflowDefinition {
    id: string;
    classId: string;         // which ClassDefinition this applies to
    initialPlace: string;
    places: WorkflowPlace[];
    transitions: WorkflowTransition[];
  }
  ```

- `compileWorkflowMachine(definition: WorkflowDefinition)` builds an XState machine from the stored definition at runtime. An object's `workflowState` is just the current XState value (a string), persisted back to the object row after every successful transition.
- A class with no `WorkflowDefinition` row falls back to the plain Draft/Published toggle from §2.1 — `workflowState` stays `null`.
- `setPublished` on a transition is how a workflow "publishes" or "unpublishes" an object as a side-effect (e.g., the `approve` transition into the `approved` place sets `published = true`; a `retract` transition sets it back to `false`). This is the same pattern Pimcore's own Workflow component uses for its `publish`/`unpublish` transition actions — deliberately reused rather than inventing a new mental model for the same problem.

---

## 3. Data Model Changes (`packages/core`)

`packages/core/src/db/schema.ts` is currently placeholder TypeScript interfaces (no real Drizzle table definitions exist yet despite the file's comment). This plan assumes the first real Drizzle schema pass happens alongside or just before this feature, since it depends on actual persisted columns.

- `data_objects` (or whatever the real Drizzle table ends up named): add
  - `published boolean not null default false`
  - `workflow_state text null`
- New table `class_workflow_definitions`: `id`, `class_id` (FK → class definitions), `initial_place`, `places_json`, `transitions_json`, `created_at`, `updated_at`. One row per class that has opted into a workflow; absence of a row = no workflow for that class.
- New table `object_preview_tokens`: `token` (PK), `object_id` (FK), `expires_at`, `created_by`, `created_at`, `revoked_at null`, `view_count default 0`.
- New table `workflow_transition_log`: `id`, `object_id`, `from_place`, `to_place`, `transition_name`, `actor_id`, `occurred_at`, `note null` — audit trail of who moved what through the workflow and when. No equivalent audit mechanism exists anywhere else in the codebase yet, so this is new infrastructure, not an extension of something existing.

---

## 4. API Surface Changes

- GraphQL object type gains `published: Boolean!` and `workflowState: String`.
- Mutations (all backend/admin-only, pending §6's auth dependency): `publishObject(id)`, `unpublishObject(id)`, `transitionObjectWorkflow(id, transitionName)`, `createObjectPreviewLink(id, expiresInDays)`.
- `transitionObjectWorkflow` validates the requested transition against the compiled XState machine's current state before applying it — invalid transitions (wrong source place, disallowed role) are rejected with a typed error, not silently ignored.
- Preview resolution is a plain HTTP route (`GET /preview/objects/:token`), deliberately **not** a GraphQL query, so it can never be reached by anything that also has access to the public schema's object list/search — the only way in is having the exact token.

---

## 5. Admin UI Changes (`apps/admin-dashboard`)

- `ObjectsView.vue` (currently a fully static mock table): add a real Published/Draft badge, a workflow-state badge when the object's class has a workflow, and row actions — a Publish/Unpublish toggle plus one button per valid outgoing transition from the object's current place (hidden/disabled if the signed-in identity's role isn't in that transition's `allowedRoles`, once roles exist).
- New Settings sub-page, "Workflows": list of class → workflow definition, with a simple form-based editor (add/remove places, add/remove transitions with from/to/role/`setPublished`). A graphical drag-and-drop editor is a nice-to-have for a later iteration, not required for v1.
- Object detail view: a "Generate Preview Link" action showing the shareable URL, its expiry, and a revoke button.

---

## 6. Open Questions

These are flagged rather than decided unilaterally — they affect implementation but aren't blocking the plan itself:

1. **Preview token format**: stateless signed JWT (simpler to verify, but revocation needs a denylist) vs. opaque token + the `object_preview_tokens` DB row described in §3 (trivial revocation and view-count tracking, costs one extra table). This plan leans toward the DB-row approach for simplicity of revocation, but it's worth confirming before building.
2. **Auth/permissions system**: this plan's `allowedRoles` and "admin-only" mutations assume *something* will exist to identify who's making a request and what role they hold. Nothing like that exists in the codebase today. Building the workflow engine's role-gating (or the preview-link issuance gate) has a hard dependency on that landing first — worth sequencing explicitly rather than discovering it mid-implementation.
3. **Documents timing**: confirm whether Documents should get this in the same implementation pass as Objects, or strictly as a fast-follow once Objects ship (current assumption: fast-follow, see §7 Phase 5).

---

## 7. Phased Rollout

- **Phase 1** — `published` boolean + the public/backend API split (no workflow yet). Smallest useful slice; unblocks "objects are only visible through the public API once published."
- **Phase 2** — Preview link tokens (§2.3).
- **Phase 3** — Workflow definitions (§2.4): authoring model, XState compilation, transition mutations, audit log.
- **Phase 4** — Admin UI: badges, row actions, workflow editor (§5).
- **Phase 5** (fast-follow, outside this plan's core scope) — extend the identical mechanism to Documents.
