# Whoobe 0.2.0 - release notes

Release 0.2.0, named **Conduct**: the release that lets an organisation with a security officer say yes. Written from `CHANGES.md` on **2026-10-19**;
the procedure that turns this into a release is in [`release-process.md`](release-process.md) (copy the text into `.release/notes-v0.2.0.md` after
`scripts/release.sh prepare`). The plan it follows is `docs/plans/system/release-0.2-plan.md`. Because the version starts with `0.`, a minor release may
change behaviour: read **Behaviour changes** before upgrading. **Seven migrations (0060 to 0066)**, all additions; back up first.

## What is in it

**Govern: what a security officer asks**
- **Audit log of administrative actions.** An append-only table (the database refuses UPDATE and TRUNCATE; DELETE only for the retention job) with
  who, from which address, what, on which target and the fields before and after; secrets are recorded as "changed", never as a value. Users, roles,
  websites, settings, publication, integrations, single sign-on, data subject requests. A route that changes something must say whether it is
  audited: a test fails for a new route with no decision. Read it in *Security > Audit Logs* (filters, CSV), `GET /audit-log`, permission
  `audit:read`. Retention `AUDIT_RETENTION_DAYS` (365). [Guide](operations/audit-log.md).
- **Mandatory two-factor authentication and a password policy.** An administrator chooses the roles that must use a second factor; a user of such a
  role who has none is led to enrolment at the next sign-in and gets **no session** until it is done, and cannot turn it off afterwards. The password
  policy (minimum length 8 to 128, optionally three of four character classes, never the e-mail address) applies where a password is set. Off by
  default: an upgrade changes nothing.
- **Single sign-on for staff (OpenID Connect).** Authorization code with PKCE against one provider (Keycloak, Microsoft Entra, Okta, Google ...), roles
  from a claim at every sign-in (the roles in the mapping follow the claim, the ones given by hand are left alone), provisioning and linking by a
  **verified** e-mail only, `localLogin` for the break-glass of administrators. A person removed at the provider cannot start a new session. Tried
  against the test mock and a real **Keycloak 26**; Entra, Okta and Google follow the standard and were **not** tried. SAML and LDAP are not built (a
  broker in front covers them). [Guide](operations/single-sign-on.md).
- **Data subject requests and retention.** Find, export and erase everything held about one person by one value (an e-mail): form submissions, the
  files they uploaded (deleted from the library first), the mail log; staff accounts are reported, never erased by it. A dry run first, the value typed
  again to erase, audited with a fingerprint and never the value. **Retention** per data class and for the mail log, deleted daily, **off until you set
  a number**. [Procedure](operations/data-subject-requests.md).
- **Readiness and metrics.** `GET /health` answers 503 when the database does not answer; `GET /health/live` is the cheap liveness; `GET /metrics`
  (Prometheus: requests by matched route, queue depth of publication jobs and event deliveries, database up, audit rows lost) is **off** unless
  `METRICS_TOKEN` is set. [Observability](operations/observability-and-logging.md).

**Orchestrate**
- **More events.** Files in the library (`asset.created`, `.updated`, `.moved`, `.deleted`, `.bulk`) and pages (`page.published`, `.unpublished`)
  through the same subscriptions, delivery, signature and loop guard as object events. The envelopes carry ids and metadata, never contents.
  [Object events](communication/object-events.md).

**CDN mirroring**
- **Per website, with a default**, and a second provider: **Cloudflare Images** next to Cloudinary (it takes `multipart/form-data`, which the Gateway
  cannot send, so Whoobe calls it directly with an API token stored encrypted). The mirror of the website's own provider is served when an asset has
  several. Tried against a mock of Cloudflare Images only: **a real account has not been tried**. [Publishing, step 1b](content/publishing/website-publishing.md).

**Dashboard**
- A **Security** entry in the sidebar groups Roles/Users/Workspaces, Two-Factor Authentication, Sign-in Requirements, SSO, Data Subject Requests, System
  Logs and Audit Logs; each page is shown by permission. The sidebar opens as four closed groups with closed submenus (showing a section opens its own).
- Websites > Paths: a pencil on a path linked to a page opens it in the editor. The status badge reads `/health` and the build version.
- A **Resend** mail provider recipe (the sender goes out as the address only).

**Operations and quality**
- The upgrade test, the restore rehearsal, the load test and the release workflow of 0.1.1 stay; the upgrade test now runs from 0.1.1 to this tree
  across the seven new migrations.
- API suites of the new features run on the disposable stack with a **mock OIDC provider that forges nine kinds of token**, a mock Cloudflare Images,
  a real Keycloak (opt-in) and real form uploads; `check-docs.py` is green again (earlier branches had edited the generated API reference by hand).

## Behaviour changes to check before you upgrade

| Change | What you see | What to do |
|---|---|---|
| **Migrations `0060` to `0066`**: `audit_log` (append-only by trigger), `security_settings`, `oidc_settings`, `user_identities`, `cdn_mirror_settings`; columns `data_classes.retention_days`, `security_settings.mail_log_retention_days`, `oidc_settings.dashboard_url`, `object_events.subject_type`; `object_events.class_id` becomes nullable; three indexes | applied by core-api at the first start; `0066` copies an existing CDN mirror setting (kept until now in the first website's `settings`) as the default | back up first ([upgrade](operations/upgrade-and-migrations.md)); going back to 0.1.1 means restoring that backup (the migrations are additions, a rollback on the migrated database is not tested) |
| **New permissions** `audit:read` and `data_subject:manage`, given to the role `admin` at the first start | *Security > Audit Logs* and *Data Subject Requests* appear for administrators | grant them to other roles if wanted |
| **`PUT` / `DELETE /whoobe-one/settings/cdn-mirror` need `settings:manage`** (they needed `objects:write`) | an editor can no longer change the CDN settings (reading stays) | grant `settings:manage` or let an administrator do it |
| **`GET /health` answers 503 when the database is down**; the Docker `HEALTHCHECK` of core-api calls `/health/live` | a load balancer probing `/health` takes the instance out during a database outage | point liveness probes at `/health/live`, readiness probes at `/health` |
| **nginx: new core-api prefixes** (`audit-log`, `security-settings`, `oidc-settings`, `data-subject`, and the ones 0.1.1 missed: `mail-providers`, `docs-sites`, `object-event-*`, `pwa`, `publish/jobs`, `api/v1/system`) | on a host nginx, a new screen fails with "Unexpected token '<'" until the include is re-rendered | `scripts/render-workspace-nginx.sh <workspace>` after the upgrade; `/metrics` is deliberately **not** routed |
| **Dashboard navigation**: Roles/Users and Security left Settings; System Logs and Audit log are inside *Security*; sidebar groups and submenus start closed | people look for them in the old places | the dashboard tour and the settings guide describe the new ones |
| `@whoobe-cms/core` depends on `jose`; the token verifier of the gateway moved into core | none | none |
| Public sandbox: `/security-settings`, `/oidc-settings` and `/data-subject` are blocked | the demo account cannot switch on mandatory 2FA or a provider | none |
| New optional variables: `AUDIT_RETENTION_DAYS`, `METRICS_TOKEN`, `OIDC_ALLOW_HTTP`, `OIDC_START_RATE_LIMIT_PER_MINUTE`, `DATA_SUBJECT_RATE_LIMIT_PER_MINUTE`, `CDN_ALLOW_HTTP`, `CDN_CLOUDFLARE_API_BASE` | none unless set | [configuration reference](operations/configuration-reference.md) |

Defaults that **do not change** on upgrade: nobody is required to use two-factor authentication, single sign-on is off, no retention is set, `/metrics` is
off, no password rule beyond the length of 8.

## Known limits

- Single sign-on: one provider, no SAML or LDAP, no single logout. A session already open outlives the person's removal at the provider (up to 7
  days) until an administrator deactivates the account. Entra, Okta and Google were not tried.
- Data subject requests match the **whole value** only, find a person typed inside a longer text in the mail log but not in objects, and do not reach
  backups (a restore brings the person back: erase again). There is no register of requests.
- Audit log: successful actions only; no failed attempts, no gateway administration, no tamper evidence beyond the database rule.
- Events: creating, editing and deleting a page, and the end of a publish job, are not events yet.
- CDN: a real Cloudflare Images account was not tried; deleting an asset does not delete its mirror.
- In-memory state in core-api (the sign-in in progress, the enrolment tokens, the login throttle) is per process: one core-api replica.

## Tested

The API and browser suites on the disposable stack, the unit and integration suites of `core`, `check-docs.py`, the upgrade test from v0.1.1, the
static scans, the isolation and TLS checks and the ZAP scan on the release commit: see [`security/status-summary.md`](security/status-summary.md).
