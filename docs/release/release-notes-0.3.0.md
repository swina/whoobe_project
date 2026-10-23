# Whoobe 0.3.0 - release notes

Release 0.3.0, named **Operate**: Whoobe for those who run it for others (an agency with many client workspaces) and for an organisation on a
private network. Written from `CHANGES.md` on **2026-10-23**; the procedure that turns this into a release is in [`release-process.md`](release-process.md).
The plan is `docs/plans/system/release-0.3-plan.md`; on 2026-10-23 its scope was cut (decision 7): what is below is built, the rest moves to 0.4
(**Not in this release yet**). Because the version starts with `0.`, a minor release may change behaviour: read **Behaviour changes** before upgrading.
Base image: Node.js 22.23.4.

## What is in it

**Operate many workspaces**
- **Fleet commands**, `scripts/workspaces.sh`: `list`, `status`, `verify`, `backup` and `upgrade <tag> [--canary slug] [--no-backup] [--yes]` over
  every workspace of the host. One failing workspace does not stop the others (exit status 1, the slugs are listed). `upgrade` backs up first (a
  workspace whose backup fails is not upgraded), checks the tag out once, waits for health, and on a workspace running released images puts back the
  previous `WHOOBE_VERSION` if the new images cannot start; if no workspace could be recreated, the tree goes back to where it was. Every action is a
  JSON line in `$HOME/.whoobe/fleet-actions.log`. Tried on three real throwaway workspaces and on released-style images. [Guide](operations/creating-workspaces.md).
- **Workspace label.** `WHOOBE_WORKSPACE` adds `workspace="<name>"` to every core-api metric and a `workspace` field to every log line (unset: output
  unchanged).
- **Install from released images.** `provision-workspace.sh --image-prefix P --image-version V` starts a workspace from published images with no build;
  the dashboard and the editor read their addresses when the container starts (`/config.js`), so one image serves every workspace.

**Private network (no route to the internet)**
- **Profile `private`** (`provision-workspace.sh --profile private`): no Google Fonts, no Material Icons CDN, no Unsplash or picsum; Inter is bundled in
  the dashboard and the editor, and image placeholders are a local grey picture. Run on a Docker network with no route out: 7 containers healthy, the
  API suite and `workspaces.sh verify` pass, no failed outside connection in any log. [Page](operations/private-network.md).
- **Custom fonts.** Upload woff2 files in *Settings > Custom fonts* (several files of a family at once; family and style guessed from the names).
  They are used in the editor, copied into generated sites and mobile apps, and written as `@font-face` in e-mail. Tried end to end on a network with no
  route out. [Settings guide](settings/settings-guide.md).
- `enable-tls.sh --reuse-cert` accepts a certificate from the organisation's own CA on a private host name (syntax checked, not run).

**Generate a site**
- **A site specification any LLM can write**: schema, expansion into a bundle, instructions, check and import.
- **Template wizard and Generate Website Wizard**: snippets as default blocks, with placeholders; texts written by an AI (needs a configured provider;
  **the AI provider path has not been exercised**); palettes made by a person, with a Palettes section in the menu; pages reorderable and collapsible.
- **Kits**: a section of the dashboard to manage, export as zip and import; preview of the templates, *Duplicate to edit*, origin and version.
- **Website preview with draft pages**; deleting a website deletes its pages, templates, paths and theme; where a snippet is used, with a filter by
  website or template.
- **Pages**: a *copy link* button opens a page in the editor for a colleague on the same network (no credential in the link).
- **Published sites**: fixes to links, trailing slashes, static redirects, covers of the blog, the http to https redirect of the generated vhost, and the
  classes of a container.

**Supply chain**
- `release.yml` requires an annotated tag whose signature GitHub verifies, builds six images (`core-api`, `asset-processor`, `gateway`, `publisher`,
  `admin-dashboard`, `whoobe-one-spike`) for amd64 and arm64, signs them with cosign, attests build provenance (SLSA) and drafts the release with the
  digests, `openapi.yaml` and the SBOM. Run on a trial tag, then installed from `ghcr.io` on an isolated network; the trial was removed.

**Security policy**
- **Disclosure policy**: a High or Critical finding found by the project is private until the release that fixes it, then public in the register
  (new column *Public from*); the private place is a draft security advisory with its temporary private fork; acknowledgement in 7 days, target 30
  days to fix High/Critical and 90 days Medium. [Policy](security/disclosure-policy.md), [`SECURITY.md`](https://github.com/swina/whoobe_project/blob/master/SECURITY.md).
- Security results stay public with a release gate; markdown-it 14.3.3 and libx11 updated in the images.

## Behaviour changes to check before you upgrade

| Change | What you see | What to do |
|---|---|---|
| The dashboard's image fallback was an Unsplash photo; it is now a local grey picture | broken images in the dashboard look different | nothing |
| `docker-compose.yml` names the five application images `${WHOOBE_IMAGE_PREFIX:-whoobe}-<service>:${WHOOBE_VERSION:-local}` | unchanged when the variables are not set | nothing |
| The dashboard and the editor read `/config.js` at start (build-time values remain the fallback) | none for a workspace built as before | rebuild keeps working |
| nginx routes `/fonts`, `/whoobe-one/editor-base`, and a browser navigation to `/settings`, `/pages`, `/documents` reaches the dashboard | a refresh of these pages no longer shows `Cannot GET` | on a workspace provisioned earlier, run `scripts/render-workspace-nginx.sh <slug>` and reload nginx |
| `POST /fonts` and wizard palette create/update answer 409 (not 500) on a duplicate | | nothing |
| **Excel import and XLSX export removed** (the library `xlsx` had two high advisories and no fix): *Objects > Export* offers CSV and JSON; *Class from file* accepts `.json`, `.csv`, `.tsv` | a `.xlsx`, `.xls` or `.ods` file is refused | save the sheet as CSV first |
| **Kits** get an origin: every kit that exists is marked `user` (editable); bundled kits are read-only, refreshed by the seed, and copied with *Duplicate to edit*. Kit templates with a duplicate or non-string id get a new one (migration `0068`) | the Kits section shows origin and version | nothing |
| The dashboard and the editor **no longer load Google Fonts or Material Icons**: Inter is bundled | the dashboard looks the same, with no request to `fonts.googleapis.com` | nothing |
| New optional variables: `COMMUNITY_URL` (the Help entry of the dashboard; unset = the project's GitHub Discussions, empty hides it), `ADMIN_PUBLIC_URL` (also used by *copy editor link*), `PLACEHOLDER_IMAGES` / `VITE_PLACEHOLDER_IMAGES` (`local` = grey picture instead of picsum), `WHOOBE_WORKSPACE` (label in metrics and logs), `WHOOBE_IMAGE_PREFIX` / `WHOOBE_VERSION` (named images; set by `provision-workspace.sh --image-version`) | the dashboard sidebar has a Help entry | set `COMMUNITY_URL=` to hide it; all others are off by default |
| In *Assets*, a **type filter** looks in the whole library and hides folders; audio files (`mp3`, `wav`, `m4a`) have their own type and player; files already stored as `application/octet-stream` are served with the type of their extension | an mp3 uploaded before opens in an audio player | nothing |

**Six migrations (0067 to 0072)**, applied by core-api at the first start; back up first (`scripts/workspaces.sh upgrade` does). Five are additions (new columns on kits and snippets, tables `wizard_palettes` and `custom_fonts`); **`0068` rewrites data**: in each kit, template ids that are not a string or repeat an earlier one are replaced by `tpl-<8 hex>` (the old editor wrote the number 0 for several templates); kits whose ids are fine are not touched. Upgrade test from v0.2.0 on 2026-10-23: 67 migrations at the start, 73 after, data written by 0.2.0 intact, login works (CI run 39937017622).

## Known limits of this release

- The *Assets* changes (the type filter across folders, audio types and player, the PDF preview sending the session) were **not checked in a browser** before
  the release; the PDF preview 404 reported by the owner has a probable cause (the session cookie missing on a cross-origin fetch) that was not reproduced.
- The Generate Website Wizard has never been run with a real AI provider; the manual security checklist was not repeated for the features added since 0.2.0
  (see the status summary).
- `postgres:16-alpine` carries 26 HIGH/CRITICAL reports, all in its `gosu` helper (Go stdlib, runs once at start); reported, not gating. A derived image
  without it is planned for 0.4.

## Not in this release yet

Level 1 items of the plan that are not built, and so not promised: more than one replica (challenges and counters out of memory, shared limiters,
migration lock, multi-replica test), the managed-database variant and Helm chart, failed-attempt audit with correlation id and hash chain, metrics for
asset-processor and gateway, rehearsals on the reference host, the `enterprise` profile and the installation checklist. Not tried: `pnpm build` of a
generated site on a private network (needs a registry mirror), a real e-mail send, the `mobile-app` and docs site kinds, real Cloudflare Images.
