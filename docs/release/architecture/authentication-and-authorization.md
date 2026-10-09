# Authentication and authorization

Who and what can act on the system, how each identity proves itself, and what each is allowed to do. Verified against
`packages/core/src/auth/`, `apps/core-api/src/server.ts`, `apps/gateway/src/` and the route contract
`scripts/security/routes.expected.json`.

## 1. Identities

| Identity | Proves itself with | Lives in | Used for |
|---|---|---|---|
| **User** (administrator, editor, viewer or a custom role) | e-mail + password, optional TOTP second factor; the result is a session cookie | `users`, `sessions` | the dashboard and the editor |
| **Visitor** (anonymous) | nothing | - | the public read API, public forms, asset delivery of public files |
| **Published site** | per-website *site key* (`X-Whoobe-Site-Id` + `X-Whoobe-Site-Key`) | `websites.settings` (hash, pepper `SITE_API_KEY_PEPPER`) | the gateway: resolving bindings, submitting gateway forms. Held by the site's server, never the browser (the SDK offers a same-origin proxy path for that) |
| **Service** | bearer `DAM_SERVICE_TOKEN` (shared secret in the environment) | environment | core-api and the logger calling asset-processor; the only service-to-service credential |
| **Preview link** | random token in the URL | `data_object_preview_tokens` | showing an unpublished data object to a person without an account, until it expires |
| **Form-upload ticket** | HMAC-signed, 10-minute token from `POST /public/uploads/intent` (`UPLOAD_TOKEN_SECRET`) | in the URL only | sending the bytes of one approved file |

There is no SSO, SAML, OIDC, LDAP or API-token mechanism for users. Automation that needs an identity uses a user
account (and therefore a session) or, for content delivery, a site key.

## 2. Users and passwords

- Password hashing: **argon2id** (`argon2` package defaults). Minimum length 8 characters at reset and at user creation;
  there is no complexity, breach-list or rotation rule.
- First administrator: created at the first start from `SEED_ADMIN_EMAIL`; with no `SEED_ADMIN_PASSWORD` a random
  password is generated and printed once in the core-api log (never a default one). Change it at first login.
- **Login throttling** (in memory): after 5 failures from the same client address + e-mail the pair is locked for 15
  minutes; 25 failures for one e-mail from any address lock that e-mail for 15 minutes. The client address is `req.ip`:
  set `TRUST_PROXY=1` behind nginx, otherwise every visitor shares the proxy's address. The table is cleared by a
  restart and is per process.
- **Password reset**: e-mail with a link (`ADMIN_PUBLIC_URL`), the token is stored hashed, lifetime one hour, a reset
  revokes every session of the user. Forgot-password is rate limited.
- Deactivating a user (`is_active=false`) ends their access at the next request (the flag is read on every request).

## 3. Sessions

| Property | Value |
|---|---|
| Token | 32 random bytes (hex), opaque, no JWT |
| Storage | `sessions` row whose primary key is the SHA-256 of the token (the token itself is never stored, F-056), with user, expiry, last seen, client IP and user agent |
| Cookie | `wcms_session`, `HttpOnly`, `SameSite=Lax`, `Secure` when the request is HTTPS or `X-Forwarded-Proto: https` (override `COOKIE_SECURE`) |
| Lifetime | 7 days from login; **not** extended by activity (`last_seen_at` is only recorded) |
| Revocation | logout; password change or reset (all sessions of the user); deactivation |
| Validation cost | each authenticated request does three queries (session + user, `last_seen` update, effective permissions); core-api and asset-processor both validate against the same table |
| Concurrency | no limit on parallel sessions, no "log out everywhere" button other than a password change |
| Cleanup | rows expired or revoked more than a week ago are deleted at core-api start and every six hours |

## 4. Second factor (TOTP)

- Optional per user, enrolled in the dashboard: TOTP secret + QR code, then a code to confirm; ten one-time recovery
  codes are shown once and stored hashed.
- The secret is stored AES-256-GCM encrypted (`TOTP_ENCRYPTION_KEY`; if unset a warning is logged and secrets stay in clear
  text; **losing the key forces re-enrolment of everyone**).
- A login with MFA returns a short-lived `mfaToken` instead of a session; five wrong codes spend the token; ten failures per
  account lock further attempts for 15 minutes; a code already used is rejected for two minutes (replay); disabling MFA
  needs the password again (five failures lock for 15 minutes).
- MFA cannot be made mandatory for a role or for the installation.
- Break-glass for an administrator who lost both factors: the operator can clear MFA for a user by running the core
  reset script with `RESET_USER_EMAIL`, `RESET_USER_PASSWORD` and `RESET_USER_CLEAR_MFA` (in `packages/core/src/db/scripts/`).

## 5. Authorization

### Model

Role-based and **global to the workspace**: `user_roles(user, role)` → `role_permissions(role, permission)`. A user's
effective permissions are the union over their roles, read from the database on every request (a change applies at
the next request, no re-login). There are no per-website, per-folder or per-object scopes, no deny rules and no
attribute-based rules. Three roles are seeded (`admin`, `editor`, `viewer`); more can be created in the dashboard.

### Permissions

44 keys exist (`packages/core/src/auth/permissions.ts`): 9 flat keys, 1 gateway key and 34 granular ones. **core-api enforces eight
flat keys; the 34 granular ones are never checked**:

| Key | Routes that require it (core-api contract) |
|---|---|
| `objects:write` | 70 (create, change and delete content, upload approval settings, imports ...) |
| `objects:read` | 50 |
| `settings:manage` | 31 |
| `users:manage` | 12 |
| `assets:view` | 4 |
| `objects:publish` | 2 (and the publish state of pages and objects, F-035; website import, F-052) |
| `workflows:manage` | 2 |
| `assets:list` | 1 |

asset-processor additionally checks `assets:upload` and `assets:delete`, and the gateway admin routes `gateway:manage`.

The other keys - the granular `<context>:<action>` family (`pages:edit`, `snippets:create`, `data_objects:view`,
`websites:delete`, `themes:*`, `components:*`) - are created, seeded into the default roles and shown in the roles screen,
but **no route checks them** (finding F-058). Granting or removing one changes nothing. Real access control is
`objects:read`, `objects:write`, `objects:publish`, `settings:manage`, `users:manage`, `assets:*`, `workflows:manage`
and `gateway:manage`.

### Default roles (seed)

| Role | Seeded with | What that means in practice |
|---|---|---|
| admin | all 44 keys | everything |
| editor | `objects:read`, `objects:write`, `assets:upload`, `assets:delete`, `workflows:manage` and 24 granular keys (list/view/edit/create on websites, pages, snippets, data objects, components, assets; list/view on themes) | reads and writes content and assets; **cannot** publish (`objects:publish`), delete objects, manage settings, users or the gateway |
| viewer | `objects:read` and 14 granular list/view keys | reads everything, writes nothing |

Before 2026-10-09 the seeded editor and viewer had **no** `objects:*` key and got 403 on most routes (F-058); the seed now adds
the missing links at every start, so existing installations are corrected at their next start. The `api/third-party-credentials`
suite logs in as a user with each seeded role and checks what it can and cannot do. Roles you create yourself need the same flat keys
(`objects:read` to read, `objects:write` to change, `objects:publish` to publish).

### Enforcement and proof

Every route of core-api is declared in `scripts/security/routes.expected.json`: **214 routes - 172 need a permission, 8
need only a login, 34 are public** (the permission is always one of the eight above). The `authz-matrix` suite calls every route as five identities (anonymous, no
permission, read, write, admin) and compares the answer with the contract; the `route-drift` suite fails when a route
exists in the code and not in the contract (or the reverse). asset-processor and gateway routes are guarded in code
(`requireAuth`, `requirePermission`, `serviceTokenAuth`, site-key middleware) and covered by their own suites
(`uploads`, `gateway`) and by the ZAP active scan, but are not in that contract file.

## 6. The public surface

Routes under `/public/*`, `/preview/*`, `/dam-asset/*` and `/health` answer without a session:

- read-only data of **published** content only (unpublished pages and objects are filtered, also in search - F-033);
- per-address rate limits (`PUBLIC_RATE_LIMIT_PER_MINUTE` 3000, search 120, query 600, form submit 10 per 15 minutes,
  upload approval 20 and upload body 30 per minute; `0` switches a limit off);
- CORS: any origin may call them but never with credentials;
- writes exist for two things only: form submission (`/public/forms/:classId/submit`, honeypot field, optional
  notification mail only for a block an author saved - F-053) and upload approval (`/public/uploads/intent`);
- asset delivery: public files by path, private files only with a session (`DAM_ENFORCE_ASSET_VISIBILITY`);
- preview links: valid until their expiry, read one data object.

## 7. Browser-facing protections

| Topic | Implementation |
|---|---|
| CORS | credentialed CORS only for `WHOOBE_HOSTNAME` (any port or scheme) plus `CORS_ALLOWED_HOSTS` / `CORS_ALLOWED_ORIGINS`; `localhost` also outside production; the `null` origin never gets credentials (F-011) |
| CSRF | no token. Protection rests on `SameSite=Lax` cookies, JSON-only state-changing endpoints and the CORS allow-list; there are no state-changing `GET` routes in the contract. A deployment that serves the admin and a hostile site on the same registrable domain should treat this as weaker than a token |
| Security headers | services: `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `X-Powered-By` removed; SPAs (nginx): `X-Frame-Options: DENY` + `frame-ancestors 'none'` for the dashboard, `frame-ancestors` from `EDITOR_FRAME_ANCESTORS` for the editor, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. **No full Content-Security-Policy on the SPAs** (F-014, postponed) |
| Uploaded files | delivered with `Content-Security-Policy: sandbox`, `attachment` for active content types, `nosniff` |
| Error bodies | generic 5xx in production, SQL text never returned (F-018) |
| Secrets in logs | `authorization` and `cookie` headers and common secret keys are redacted by the logger |

## 8. Gateway credentials

Upstream credentials (API key, bearer, basic, OAuth2 client-credentials) are entered once, encrypted with
`GATEWAY_AUTH_ENCRYPTION_KEY`, and used only inside the gateway proxy; the browser, the editor and the published site
see an opaque binding id. Outbound calls go through `safeFetch` (SSRF guard, [threat model](../security/threat-model.md)).
See [API Gateway security](../guides/api-gateway-security.md).

## 9. Known gaps (for a risk assessment)

No SSO/OIDC; no mandatory MFA; no per-website roles; the 34 granular permissions are not enforced (F-058); no password policy beyond length; no session list or remote
sign-out for the user; no CSRF token; no full CSP on the SPAs (F-014);
third-party credentials are in clear text on installations without `INTEGRATION_SECRETS_ENCRYPTION_KEY` (F-055); login and MFA throttling is in process memory
(per replica, lost at restart).
