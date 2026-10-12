# Publishing a website from the dashboard: plan

*Date: 2026-10-12. Status: **decisions D1-D5 taken by the owner (section 5); nothing in this plan is implemented.** Statements about the code were
checked in the repository on the date above; the ones that were not are marked **(not verified)**.*

Today a site is generated from a terminal: `./publish-site.sh` (prompts, preflight checks, `--yes` for scripts) or `whoobe-publish`.
The dashboard's **Publish** modal only shows the command, "Nothing runs from here". This plan lets an administrator start the
publication from the dashboard, **without giving anyone a shell**.

---

## 1. Why not a shell in the dashboard

A terminal in the browser is remote code execution on the machine that serves it. Even for administrators only:

- one stolen or phished admin session (the dashboard is a web app, with a session cookie) becomes control of the host: database,
  object-store keys, `.env` secrets, the `SITE_KEY`s of every website;
- the image of `core-api` is deliberately small: no `pnpm`, no `corepack`, no `npm` in production (`Dockerfile`, stage `runtime`), the
  sandbox overlay runs it `read_only` with `cap_drop: ALL`. A shell there would be a shell in a locked box without the tools;
- an arbitrary command cannot be audited meaningfully, a fixed job can.

So the proposal is **a button that starts a fixed job**, never a command line typed by the user.

## 2. What the job needs (checked)

| Fact | Evidence |
|---|---|
| Generation itself is Node only: `whoobe-publish` fetches the website, its themes and its published pages from the public API and writes a project. No `pnpm` is needed to *generate*; it is needed to *install and build* the generated site (Nuxt, Next), the heavy step. | `packages/publish`, `publish-site.sh` |
| Everything the prompts decide is already a function of the CMS data: website list, whether the pages use the gateway, a gateway that answers, bindings that resolve. These checks are in `scripts/publish-preflight.mjs` and can be reused by the service. | `scripts/publish-preflight.mjs` (2026-10-12) |
| The dashboard builds the same arguments from a form (API URL, gateway, assets, domain, framework, base path, slug, revalidate, optional site key). Since 2026-10-12 it is a main tab (**Publish**, `views/PublishView.vue`), no longer a modal, with the phase 0 checks. | `apps/admin-dashboard/src/views/PublishView.vue`, `utils/publish-check.ts` |
| Permissions exist per action; the default `editor` role has no publishing ("Publishing, deleting, settings and users stay with the administrator"). | `packages/core/src/auth/permissions.ts` |
| Container hardening already exists as a pattern (`read_only`, tmpfs, `cap_drop`, `no-new-privileges`, memory / cpu / pids limits). | `docker-compose.sandbox.yml` |
| Capacity: "site generation: CPU and disk of the machine that runs it (Next/Nuxt build); not part of the services". | `docs/release/operations/capacity-and-scaling.md` |

## 3. Design

A new **publisher** service (container) next to `core-api`; `core-api` never runs the generator itself.

```
dashboard (admin) -> core-api  POST /publish/jobs {websiteId, options}   [permission websites:publish, audited]
                        |  validates with the same rules as the CLI (validateGenerateOptions), stores a job row
                        v
                    publisher  (own image: node + pnpm; no shell exposed; reads jobs from the DB / a queue)
                        |  1. preflight (the checks of publish-preflight.mjs)
                        |  2. whoobe-publish ... (argument ARRAY, never a shell string)
                        |  3. optional: pnpm install + build  (phase 2)
                        |  4. package: zip, or deploy (phase 3)
                        v
dashboard <- job log (server-sent events) + status + download / deploy result
```

Properties:

- **Fixed command, typed parameters.** The job is `whoobe-publish` with an argument array built from validated fields (the CLI already
  rejects unsafe URLs, non-UUID ids, odd site keys). No field is ever concatenated into a shell string.
- **Own permission** `websites:publish` (administrator by default), checked in the route; the dashboard hides the button without it.
- **Audit**: who, which website, which options (the site key masked), when started and finished, outcome, output size.
- **Isolation of the heavy step.** `pnpm install` and the framework build run in the publisher only: a throwaway working directory, no
  access to the CMS database or object store (it reads the public API like any visitor), CPU / memory / time limits, a network allow
  list for the package registry, `--ignore-scripts` where the generated project allows it **(not verified)**. A compromised dependency
  of a generated site must not reach the CMS.
- **Secrets.** The gateway site key is passed to the job in memory and written only into the generated site's server-side env; it is
  never in the log (the log filter masks it) and never in the job row in clear.
- **One job per website at a time**, a short queue, cancel button; output directory per job, cleaned after a retention period.
- **Not in the public sandbox.** The sandbox profile (`deploy/profiles/sandbox.env`) does not start the publisher: a public demo must not
  build arbitrary projects.

## 4. Phases

Scope is the 0.1.0 release (D1), so the phases are ordered by what must ship and what can be cut without breaking the rest.

| Phase | Delivers | Acceptance |
|---|---|---|
| **0. Link the existing checks** *(done 2026-10-12: Publish tab)* | The Publish tab calls the same preflight (gateway answers, bindings resolve, bindings never pinned) from the browser (a gateway URL typed by the user is never fetched by the server: no SSRF) and shows the result before the user copies the command; the copyable script defaults the gateway the same way as `publish-site.sh`. | The modal warns about a gateway that is the CMS API, and lists the unresolved bindings. No new service. |
| **1. Roles, jobs, generate into the served folder** | Permission `websites:publish`, default roles `admin` and a new `publisher` (D2); publisher service; `POST /publish/jobs`, job table, SSE log, audit rows; **generation only**, written to the site's folder that nginx serves (D3); atomic switch (write to a new release directory, then move a `current` symlink), previous release kept for rollback. | An admin and a publisher start a job and the generated project is in the folder; an editor gets 403; the log never contains the site key; a failed job leaves the live version untouched. |
| **2. Build, static and server (D5)** | Install and build in the isolated runner, for a **static export** (served by nginx from the release folder) and for a **server build** (a Node process behind nginx; the site key and gateway forms need it). The job form has the choice, the default follows what the pages need (the preflight already knows whether the site uses gateway forms). | A Nuxt and a Next site build both ways from the dashboard; a hostile `postinstall` in a test dependency cannot read the CMS env or reach the database. |
| **3. Verify before it goes live** | After the build, **Preview** starts the site's dev server (`pnpm dev`) or the built server in the runner for a limited time, behind nginx on a per-job URL that needs the dashboard session; the user checks it, then **Publish** switches `current` or **Discard**. | The preview is unreachable without a session, stops after the time-out or on discard, and a preview never touches the live release. |
| **4. Remote runner** | The runner can be on the CMS host or on another machine (D4): same job protocol, the runner pulls jobs (outbound only) or is called over HTTPS with a token; the output is pushed to the web host (rsync / SSH, object store) instead of the local folder. | Same job, local and remote: identical output; the remote runner holds no CMS database or object-store credentials. |

Phases 0 and 1 are the minimum for the release; 2 and 3 are the part the owner wants for the final check ("pnpm dev for a last verification");
4 can follow if the release date is tight, because phase 1-3 already work on the CMS host with limits.

## 5. Decisions (owner, 2026-10-12)

| # | Question | Decision | Consequence |
|---|---|---|---|
| D1 | In scope for the release? | **Yes, 0.1.0.** | Phases 0-3 are release work; docs, findings and tests follow the usual release gates (security test plan: the job routes, the role, the log masking, the runner isolation). |
| D2 | Who may publish? | **Administrators and a `publisher` role.** | New default role `publisher` with `websites:publish` and read access to websites / pages, no settings, users or deletion (fits "roles by function"). Seed and `DEFAULT_ROLE_PERMISSIONS` change; existing workspaces need the role created by a migration. |
| D3 | Where does the output go? | **A folder served by nginx.** | A per-website directory (`<publish root>/<slug>/releases/<id>` + `current` symlink) mounted read-write in the publisher and read-only in nginx; `render-workspace-nginx.sh` gets a location per published site (static: files; server build: proxy to the site's process). The base path of the site must match the nginx location (already a generator option). |
| D4 | Build on the CMS host or elsewhere? | **Both.** | The runner is a separate service from day one, started on the same compose as the CMS or on its own machine; phase 4 adds the remote protocol. Local runner: cpu / memory / time limits from the sandbox overlay pattern. |
| D5 | Static or server? | **Both**, plus a verification step with `pnpm dev`. | Two build kinds and a preview process (below). A static export cannot use the gateway site key or gateway form submissions: the job form says so and the preflight blocks a static export of a site with gateway forms unless the user accepts it. |

### The preview (`pnpm dev`) needs its own rules

A dev server is a long-lived process running the generated project's code and its dependencies, exposed to a browser: the riskiest part of the
plan.

- It runs **in the runner only**, in the job's directory, as an unprivileged user, with no CMS credentials and no access to the CMS network
  except the public API and the gateway URLs the site was generated with.
- It listens on a random loopback port; nginx exposes it at `/publish-preview/<job id>/` **only after an auth sub-request to core-api**
  (the dashboard session, permission `websites:publish`). No public port, no direct link that works without a session.
- Hard time-out (default 15 minutes) and one preview per website; stopped on discard, on publish and when the runner restarts.
- The dev server's HMR websocket needs the same auth and the proxy rules for upgrade; a preview of a site with a base path is served under both
  prefixes **(not verified: Nuxt and Next dev servers with a base path behind a path prefix; the first step of phase 3 is a spike)**.
- Where `pnpm dev` is not wanted (the sandbox profile, a hardened host), the same step can run the **built** site (`nuxt preview` / `next start`),
  which is closer to what visitors get and cheaper to isolate.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Remote code execution through a dependency of the generated site | build only in the isolated publisher, no CMS credentials in its environment, network allow list, time and memory limits, no build in the sandbox profile |
| An admin account used to start expensive jobs | one job per website, queue length limit, per-day quota, audit |
| Site key leaking through logs or the job row | masked in the log, stored encrypted or not at all, shown once |
| Disk growth from outputs | retention period and cleanup job, size cap per job |
| Drift between the CLI and the service | the service calls `whoobe-publish` and `validateGenerateOptions`; no second implementation of the generator |
| Operating one more container | optional service: absent means the modal keeps showing the command (phase 0 behaviour) |
| A preview used as a way in to the runner | session-checked proxy, per-job URL, time-out, no CMS credentials in the runner, single preview per website |
| A bad build replacing a good site | release directories and an atomic `current` switch, previous release kept, publish only after the preview is accepted |
| The `publisher` role seeing more than it should | explicit permission list, a test that the role cannot reach settings, users or deletion routes |
