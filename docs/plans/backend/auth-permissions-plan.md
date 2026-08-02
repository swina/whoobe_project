# Plan: Authentication & Role-Based Permissions

Planning document for a standard authentication system with role-based access control (RBAC). This was flagged as an open dependency in `docs/plans/backend/object-publish-workflow-plan.md` (§6) — that plan's `allowedRoles` on workflow transitions and its "admin-only" mutations both need *something* to identify who's making a request. This plan is that something, and is sequenced to land first. No code has been written yet.

---

## 1. Why This Comes First

Two concrete gaps exist right now, not just future ones:

- **`apps/asset-processor` has no auth at all.** Its DAM endpoints (`/api/v1/dam/upload`, `/asset` (delete), `/asset-urls`, `/exists`, `/ensure-bucket`) accept requests from anyone who can reach the port — there is no login, no session, no check of any kind. CORS is wide open (`Access-Control-Allow-Origin: *`) by design from when it was built (see `docs/DAM_implementation_plan.md`), which was reasonable while nothing else existed to gate against. That's no longer true once this plan lands — closing this is one of the concrete, immediate payoffs, not a hypothetical future benefit.
- **`apps/admin-dashboard` has no identity at all.** The "Admin User / Super Administrator" shown in `DashboardLayout.vue`'s header is a hardcoded string, not a signed-in user. There is no login screen, no session, nothing to gate any action on.

Both of the previously-planned features (Data Object draft/publish, admin-authored workflows) assume roles and permissions exist. This plan makes that true first.

---

## 2. Scope & Non-Goals

- **In scope**: email/password login, server-side sessions, a Users/Roles/Permissions data model, a guard/middleware pattern for enforcing permissions, wiring it into the two existing backend surfaces (`asset-processor`) and the one that doesn't exist yet (the core API — see §4), and the minimum admin-dashboard UI to log in and reflect what the current user can do.
- **Out of scope for v1** (explicitly deferred, see §7): multi-factor auth, SSO/OAuth against external identity providers, per-object fine-grained ACLs (this is role-based, not object-level — an "Editor" can edit any object of a class they have permission for, not just specific rows), self-service signup (users are created by an admin, not by registering themselves — matches this being an internal CMS admin tool, not a public-facing account system).

---

## 3. Core Concepts

### 3.1 Standard credential handling

- Passwords are hashed with **argon2id** (via the `argon2` package) — OWASP's current recommendation, ahead of bcrypt for new systems. Never store or log plaintext passwords; never send them back in any API response.
- Login: `POST /auth/login` with `{ email, password }`. On success, a session is created (§3.2) and its token is set as an **httpOnly, Secure, SameSite=Lax cookie** — deliberately **not** returned in the JSON body or stored in `localStorage`. Given this codebase already went through real effort to keep credentials out of the browser (the DAM backend refactor exists specifically because S3 secrets were exposed to the SPA — see `docs/DAM_implementation_plan.md`), a JWT-in-localStorage pattern would be a step backwards; httpOnly cookies keep the session token unreachable from JS entirely, which is the point.
- Rate limiting on `/auth/login` (e.g. 5 attempts / 15 minutes per email+IP pair) and a temporary account lockout after repeated failures — standard brute-force mitigation, cheap to add up front rather than bolt on later.

### 3.2 Sessions over stateless JWT (recommended, see §6 for the alternative)

Server-side sessions, backed by a Postgres table via Drizzle, with an opaque session-id cookie:

- Trivial to revoke instantly — logout, "log out all my other sessions," or an admin force-revoking a compromised account's sessions are all just a `DELETE`/`UPDATE` on one row. A stateless JWT can't be un-issued before it expires without adding a denylist, which is extra infrastructure to get the same property sessions give for free.
- This is an internal admin tool with a bounded number of concurrent staff users, not a public API serving millions of stateless requests — the usual reason to reach for JWTs (avoiding a DB hit per request) doesn't apply with any real force here.
- Session lookup is one indexed query; this is not a meaningful performance concern at this scale.

### 3.3 RBAC data model

```
users              id, email, password_hash, display_name, is_active,
                   created_at, updated_at, last_login_at

roles              id, name, description
                   (seeded defaults: 'admin', 'editor', 'viewer')

permissions        id, key, description
                   (e.g. 'objects:read', 'objects:write', 'objects:publish',
                    'objects:delete', 'assets:upload', 'assets:delete',
                    'workflows:manage', 'users:manage', 'settings:manage')

role_permissions   role_id, permission_id      (many-to-many)
user_roles         user_id, role_id            (many-to-many — a user can hold
                                                 more than one role; effective
                                                 permissions are the union)

sessions           id (token), user_id, created_at, expires_at,
                   last_seen_at, ip, user_agent, revoked_at
```

Permissions are opaque `resource:action` strings, not a fixed enum baked into code — new features add new permission keys and attach them to whichever roles should have them, without a code change to the permission model itself. This is also why code should always check **permissions**, never role names directly (`if (user.can('objects:publish'))`, not `if (user.role === 'editor')`) — an admin reassigning which role has which permission should never require redeploying code.

> [!IMPORTANT]
> This corrects a detail in `object-publish-workflow-plan.md` §2.4: `WorkflowTransition.allowedRoles` should become `allowedPermissions` (e.g. `['workflow:transition:approve']`), consistent with the permission-string model here rather than checking role names directly. Small fix, worth making before that plan is implemented.

### 3.4 Enforcement pattern

A single reusable pair, implemented once and reused everywhere:

- `requireAuth()` — rejects unless a valid, non-expired, non-revoked session is present.
- `requirePermission(key: string)` — implies `requireAuth()`, additionally rejects unless the session's user has `key` in their effective permission set (computed as the union of all permissions across all of the user's roles).

Every mutation and every query that isn't explicitly public goes through one of these two. The public API (per `object-publish-workflow-plan.md` §2.2) remains intentionally unauthenticated but is separately restricted to `published = true` content — auth and the publish gate are two different mechanisms solving two different problems, and neither should be asked to do the other's job.

---

## 4. Where This Lives (Backend Topology)

`Initial-Plan.md` left "NestJS or Fastify" undecided for the core API and describes it as a separate GraphQL service from the DAM engine. Auth is the first real feature that needs that core API to exist — until now, `apps/asset-processor` (Express) has been the only backend in this repo.

**Recommendation: NestJS**, as a new `apps/core-api` workspace package, for this specific feature:

- First-class `@nestjs/passport` integration (`passport-local` for the login credential check) — Passport is the standard, most widely-used auth toolkit in the Node ecosystem, not a niche choice.
- Guards and decorators (`@UseGuards(PermissionsGuard)`, `@RequirePermission('objects:publish')`) map directly onto the `requirePermission()` pattern in §3.4 and read clearly at each protected route/resolver.
- Its module system suits a project that's about to grow a GraphQL layer, an Objects module, a Documents module, and this Auth module side by side, more than a flatter Fastify app would.

This is a bigger commitment than picking a library — it's the first line of a service that everything else (Objects, Documents, workflows) will eventually live in — so treat the framework choice itself as something to confirm, not something this plan silently locks in.

**`apps/asset-processor` stays a separate Express service** (per the existing "Microservice Isolation" principle already established for it), but needs to independently verify the same sessions `apps/core-api` issues — both processes read from the same `sessions` table (shared Postgres instance, already true today for other data) to validate an incoming cookie. This avoids re-routing all asset traffic through `core-api` as a proxy, which would undo the direct admin-dashboard → asset-processor path built and tested over the last several turns. See §6 for the alternative (proxy through core-api) and why this plan doesn't default to it.

---

## 5. Admin Dashboard Changes

- A new login screen, gating everything else: `App.vue` currently just renders `<router-view />` (which renders `DashboardLayout` unconditionally). This becomes a check against a new `stores/authStore.ts` (`currentUser`, `permissions` as a computed `Set<string>`, `can(key)`, `login()`, `logout()`) — unauthenticated, render a login form; authenticated, render `DashboardLayout` as today.
- `DashboardLayout.vue`'s hardcoded "Admin User / Super Administrator" header block is replaced with the real signed-in user's `display_name` and role(s) from `authStore`, plus a working logout action.
- Sidebar sections, tab-opening actions, and destructive/sensitive buttons (delete asset, publish object, manage workflows, manage users) get gated behind `authStore.can('...')` — hidden or disabled, not just visually deemphasized, since a hidden button that's still wired up underneath is not actually access control.
- `dam-api.ts` calls (`uploadAssetToDam`, `deleteAssetFromDam`, etc.) rely on the browser sending the httpOnly session cookie automatically (`credentials: 'include'` on `fetch`) — no client-side token handling needed, which is exactly the point of the cookie approach in §3.1.

---

## 6. Open Questions

1. **Sessions vs. JWT** — §3.2 recommends sessions and gives the reasoning; if there's a specific reason to prefer stateless JWTs (e.g. an anticipated need to scale the core API horizontally behind a load balancer without shared session storage), that would change the recommendation. Worth confirming rather than assuming sessions are right forever.
2. **NestJS vs. Fastify** (or something else) for `apps/core-api` — §4 recommends NestJS with reasoning; this is the foundational choice for every backend feature after this one, so it deserves an explicit sign-off rather than being decided by default inside an auth plan.
3. **Asset-processor auth verification: shared session table vs. proxy through core-api** — §4 recommends shared verification (both services read the same `sessions` table) to preserve the existing direct admin-dashboard → asset-processor path. The alternative — making `asset-processor` internal-only and routing all its traffic through `core-api` as a gateway — is more conventional in a "one public entry point" sense, but undoes work already built. Worth a deliberate choice, not a default.
4. **Password reset / forgot-password flow** — standard for "standard auth," but depends on an outbound email-sending capability (SMTP relay or a transactional email provider) that doesn't exist anywhere in this project yet. This plan assumes that's a separate, small prerequisite rather than building it inline here.
5. **Seed users** — someone needs to exist to log in as before anyone can create more users through the app. Plan assumes a one-time seed script (`packages/core` or `apps/core-api`) creating an initial admin account from environment variables at first boot, not a hardcoded default password shipped in code.

---

## 7. Explicitly Deferred (not v1)

- Multi-factor authentication.
- SSO / OAuth against external identity providers (Google Workspace, Okta, etc.).
- Per-object ACLs (e.g. "this editor can only touch objects in the `/products/electronics` branch") — this plan is role-based only; object-level restrictions are a materially different (and larger) feature.
- Self-service signup — users are provisioned by an admin (`users:manage` permission), matching this being an internal tool.

---

## 8. Phased Rollout

- **Phase 1** — Data model (`users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`) + seed default roles/permissions + seed the first admin user.
- **Phase 2** — `apps/core-api` scaffold (pending §6.2) with `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, password hashing, rate limiting, account lockout.
- **Phase 3** — `requireAuth()` / `requirePermission()` wired into `apps/asset-processor`'s existing DAM endpoints — the first real protected resource, and the one closing the concrete gap described in §1.
- **Phase 4** — `apps/admin-dashboard`: login screen, `authStore`, real user display, gating of sensitive UI actions.
- **Phase 5** — Password reset flow (pending §6.4's email prerequisite) and any remaining hardening.
- **Phase 6** — Reconcile with `object-publish-workflow-plan.md`: switch its `allowedRoles` to `allowedPermissions`, wire `publishObject` / `transitionObjectWorkflow` / preview-link issuance behind `requirePermission`, and resume that plan's own phased rollout on top of this foundation.
