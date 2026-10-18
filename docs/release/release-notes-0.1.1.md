# Whoobe 0.1.1 - release notes

The first release after 0.1.0 (2026-10-14): the work done on `master` since then, 80 commits. One version number for the whole
product. Written from `CHANGES.md` on **2026-10-18**; the procedure that turns this into a release is in
[`release-process.md`](release-process.md) (copy the text into `.release/notes-v0.1.1.md` after `scripts/release.sh prepare`).
Because the version starts with `0.`, a patch release is meant to contain fixes; this one also carries one new feature (object
events) that touches the database and the gateway, so read "Behaviour changes" before upgrading.

## What is in it

**Object events** (new)
- A subscription tells an automation engine or any HTTP service when a Data Object is created, changed, deleted, published or
  unpublished: outbox, delivery with retries, signature (HMAC), delivery log, test event. Dashboard section *Data & Communication >
  Object events* (permission `object_events:manage`), the *Connect a flow* wizard, the API (eight routes) and an administrators'
  guide: [`communication/object-events.md`](communication/object-events.md).
- **End of a flow and loop guard**: a write through the client API with the header `X-Whoobe-Flow: stop` is recorded but not delivered
  (status `stopped`); a client that keeps writing the same record is cut by a circuit breaker (people are never cut). The delivery log
  is a tab with filters, selection and delete.
- Whoobe does not ship or favour an automation engine: the guides cover Node-RED, Activepieces and n8n as the operator's choice
  ([`communication/node-red.md`](communication/node-red.md)); the example flows are in `examples/`, not part of the distribution.

**Dashboard**
- Objects list: compact rows, a spreadsheet-like **table view** (resizable columns, cells editable in place), *Copy id* in the row menu,
  *Rows per page* fixed from page 2 on; the tab of an open record is named by a field marked *tab title*. A click on a row no longer opens
  the record (right click > Edit). Guide: [`content/objects-list.md`](content/objects-list.md).
- Object edit form: field classes override the defaults (*Class > View Layout > Input styles*), a Refresh button, markdown and rich-text
  editors follow a height set on the field.
- The API clients list shows write scopes as write.

**Generated sites and SDK**
- A `markdown` field bound to an element is converted to HTML, and a `wysiwyg` field kept as markup, both sanitised, like in the editor
  preview (`@whoobe-cms/renderer`; before, a generated site showed the source). Regenerate and republish a site to get it.

**Operations and quality**
- **Upgrade test**: `scripts/upgrade/upgrade-test.sh` installs the previous release, writes data, upgrades to the working tree and checks the
  migrations, the tables, the data and a login; it also runs as a GitHub workflow on a release tag. Passed 0.1.0 -> this tree.
- **Restore rehearsal and bucket backup**: `scripts/backup-workspace-bucket.sh` (copies the S3 bucket, or restores it) and
  `scripts/restore/rehearse.sh` (backs up a throwaway workspace, deletes it, restores it and checks the data).
- **Load test**: `scripts/load/run.sh` (k6): about 690 public pages, 330 public queries and 120 API-client reads per second under the smallest
  container limits, on a development machine; see [`operations/capacity-and-scaling.md`](operations/capacity-and-scaling.md) section 2.1.
- **Release workflow** (`.github/workflows/release.yml`): signed multi-arch images on ghcr.io and a draft GitHub Release from a tag. Written,
  **first run is this release**.
- Documentation corrected where it was no longer true (machine credentials exist as API clients; a form is not the only automation trigger; the
  editor preview and the published output are two implementations); the documentation is published at docs.whoobe.dev.

**Security**
- The `admin-dashboard` and `whoobe-one-spike` images upgrade `libexpat` (HIGH CVE-2026-77214, fixed in 2.9.0-r0); all five product images pass the
  image scan with 0 fixable HIGH/CRITICAL.
- `tailwind-merge` 3.7.0 and `marked` ^14.1.4 are new dependencies (MIT); `THIRD_PARTY_NOTICES.md` is current.
- `stack-tests`, static scans, isolation, TLS and the ZAP DAST scan ran on the release commit: see
  [`security/status-summary.md`](security/status-summary.md).

## Behaviour changes to check before you upgrade

| Change | What you see | What to do |
|---|---|---|
| **Migration `0059`** adds three tables (`object_events`, `object_event_subscriptions`, `object_event_deliveries`); nothing existing changes | applied by core-api at the first start | back up first ([upgrade](operations/upgrade-and-migrations.md)); the previous version still runs on the new schema |
| The role `admin` gets the permission `object_events:manage` at the first start; other roles do not | the *Object events* section appears for administrators only | grant it to other roles if wanted |
| **The gateway runs a delivery worker** for object events, in the same env file as core-api | inert until a subscription exists | `OBJECT_EVENTS_ENABLED=0` stops events and worker for the instance |
| New optional variables: `OBJECT_EVENTS_ENABLED`, `OBJECT_EVENTS_CONCURRENCY`, `OBJECT_EVENTS_LOOP_MAX`, `OBJECT_EVENTS_LOOP_SUB_MAX`, `OBJECT_EVENTS_LOOP_WINDOW_SECONDS`, `OBJECT_EVENTS_SECRET_<NAME>` | none unless set | [configuration reference](operations/configuration-reference.md), `.env.example` |
| Markdown / rich-text fields bound to an element are converted in generated sites | pages that showed raw markdown now show formatted text | regenerate and republish the sites |
| Objects list: a click on a row no longer opens the record | editors who relied on it | right click > Edit |
| Images of the two SPAs are rebuilt with a newer `libexpat` | none | `docker compose up -d --build` |
| **The product is called "Whoobe"** (it was "Whoobe CMS"): login page, browser title, the issuer shown by an authenticator app for a **new** 2FA enrolment (existing enrolments keep working), the sender name suggested for mail, the CLI help | text only; package names (`@whoobe-cms/*`), image names and the repository are unchanged | nothing |

## Known limits

- Everything listed as a limit in the [0.1.0 notes](release-notes-0.1.0.md) and in chapter 4 of the [overview](overview/whoobe-overview.md) still applies,
  except that upgrading from 0.1.0 is now tested by script (database step only: image rebuild on a real host, nginx and the manual checks of step 7
  are written, not rehearsed) and a restore of a throwaway workspace is rehearsed.
- No audit log of administrative actions, no OIDC login for staff, no mandatory 2FA: planned for 0.2 ([plan](https://github.com/swina/whoobe_project/blob/master/docs/plans/system/release-0.2-plan.md)).
- The load figures come from one development machine and four endpoints; uploads, AI, publishing and mixed traffic were not measured.
- `release.yml` has not run before this release: if it fails, the images are built by hand as in 0.1.0 (release process, steps 5 to 7).
- The manual security checklist was not repeated for the features added after 2026-10-09 (object events included).
