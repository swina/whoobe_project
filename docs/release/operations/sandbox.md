# Public sandbox

A demo instance anyone can try, with limits, that is deleted and rebuilt from nothing every 3 hours. It is **an ordinary
workspace** (see [creating-workspaces.md](creating-workspaces.md)) created with the profile `sandbox`: the profile
(`deploy/profiles/sandbox.env`) is a block of variables appended to the workspace's `.env.<slug>`. Nothing else
distinguishes it: the product reads the variables, the hardening overlay `docker-compose.sandbox.yml` is activated by
`COMPOSE_FILE` in that same file, so every command on the workspace (up, down, `remove-workspace.sh`) uses it.

This is an internal tool, not a supported feature for third parties: whoever wants one follows the procedure below.

## What visitors get

- One shared demo account. Its e-mail and password are public and the banner on every screen shows them (`Demo login: ...`), so a visitor who lands on the login page knows what to type; put them on the page that links to the sandbox too.
- The editor, the DAM, websites, pages, snippets, themes, the API Gateway towards the allowed hosts.
- **Demo content**, loaded again at every reset: a website "Northlight (demo)" with three pages (Home, Pricing, About), three snippets (navigation bar, announcement bar, footer) and the two kits that ship with the distribution ("Landing basics" and "Page sections", read-only: Duplicate or Edit a copy to change them). The kits are seeded by the core like on any installation; the website, pages and snippets by `scripts/sandbox/seed-demo.mjs` at the end of `reset.sh` (it runs with the Node of the core-api image, because the host's Node can be too old, and a failure only leaves the sandbox empty). The content is generated with the editor's own Element class by `scripts/sandbox/demo/generate.mjs` (outputs committed: `demo/content.json` and `packages/core/seed-data/kits/*.json`): change the generator, run `node scripts/sandbox/demo/generate.mjs`, commit the outputs.
- A banner on every screen with the time of the next reset.

## The profile: every limit is a variable

| Variable (in `.env.<slug>`) | Default of the profile | Effect |
|---|---|---|
| `SANDBOX_MODE` | `1` | Switches the restrictions on; without it the same stack is a normal workspace |
| `ASSET_MAX_FILE_BYTES` | `5242880` (5 MB) | Per-file upload cap, answers 413 (usable outside the sandbox too; default there 50 MB) |
| `ASSET_MAX_COUNT` | `50` | Maximum number of assets; a new asset or `_edited` copy over it answers 409, overwriting a path is allowed |
| `ASSET_MAX_INPUT_PIXELS` | `16000000` | Image dimensions |
| `SANDBOX_ALLOW_HOSTS` | `dummyjson.com` | The only host names outbound HTTP may reach (exact match, comma-separated); empty = none |
| `PUBLIC_RATE_LIMIT_PER_MINUTE`, `PUBLIC_SEARCH_...`, `PUBLIC_QUERY_...` | 60 / 30 / 30 | Public API rate limits |
| `WS_MAX_BODY` | `6M` | nginx request body cap (a 5 MB file plus multipart overhead) |
| `WS_EDGE_LIMITS` | 10 requests/s per address with a burst of 40, 20 connections, 60 s timeouts | nginx directives rendered into the workspace's locations include |
| `SANDBOX_NO_NEW_PRIVILEGES` | `true` | Container flag; see "snap Docker" below |
| `COMPOSE_FILE` | `docker-compose.yml:docker-compose.sandbox.yml` | Activates the hardening overlay |
| `SANDBOX_RESET_AT` | set by `reset.sh` | Time shown in the banner |

Change a value at creation with `--set KEY=VALUE` (repeatable), or edit `.env.<slug>` and recreate the containers
(`docker compose -p ws-sandbox --env-file .env.sandbox up -d`). The hardening itself (read-only root file system for the Node
services, no capabilities, memory/CPU/process limits) is in `docker-compose.sandbox.yml` and is not a variable.

### Features that are off (answer 403 "disabled in the public sandbox")

AI (`/ai/*`), mail (`/mail-*`, and sending itself), object events (`/object-event-*`: they call outside the stack), the Figma import, the migration sources, the CDN mirror settings,
PWA generation, regenerating a website's gateway key, the security and single sign-on settings and the data subject tools. Outbound HTTP through `safeFetch` is refused for every host that is not
in `SANDBOX_ALLOW_HOSTS`, checked before any DNS lookup and on every redirect hop; a listed host still goes through the
normal SSRF checks (no private or loopback addresses). So a visitor can create gateway endpoints and routes, but only towards
the allowed hosts: Cloudinary, Brevo and CDN mirroring stay off. The path list lives in `packages/core/src/sandbox.ts`.
Users and roles are read-only for the demo account (it can list them, not create, change or delete them, reset passwords or
change its own MFA, or enrol it in two-factor at sign-in), so visitors cannot lock each other out.

## Procedure

Needs a host with Docker Compose 2.24 or newer, a DNS name pointing to it, and nothing else of value on it.

1. **Clone** the repository and enter it. The reset timer expects `/opt/whoobe_project`; anywhere else, edit
   `WorkingDirectory` and `ExecStart` in the service file.
2. **First start**, by hand:
   `SANDBOX_HOST=sandbox.example.com ./scripts/sandbox/reset.sh` (`SANDBOX_SCHEME=http` or `--scheme http` on a LAN without TLS).
   It removes a previous sandbox with its volumes, provisions the workspace `sandbox` with
   `--profile sandbox`, waits for `/health` to report the sandbox block, and prints `sandbox is up`.
   Options, all environment variables: `SANDBOX_SCHEME` (`http` on a LAN, default `https`), `SANDBOX_INDEX` (ports are derived from it: check they are free with `ss -ltn`),
   `SANDBOX_DEMO_EMAIL`, `SANDBOX_DEMO_PASSWORD`, `SANDBOX_INTERVAL_HOURS`, and the overrides `SANDBOX_NO_NEW_PRIVILEGES`,
   `SANDBOX_ALLOW_HOSTS`, `ASSET_MAX_FILE_BYTES`, `ASSET_MAX_COUNT`, `ASSET_MAX_INPUT_PIXELS`.
3. **TLS** on a public host: `scripts/enable-tls.sh sandbox --email <you>` as for any workspace, once. The proxy then also
   serves port 443: if another service owns it on that host, use a dedicated host for the sandbox.
   **With nginx on the host** (the host-nginx path of [creating-workspaces.md](creating-workspaces.md)) link the vhosts once:
   `sudo ln -sf $PWD/deploy/nginx/00-sandbox-zones.conf /etc/nginx/sites-enabled/00-sandbox-zones` (the rate-limit zones belong
   to the `http` context), then `sandbox` and `sandbox-ssl` the same way, and `sudo nginx -t && sudo systemctl reload nginx`.
   Every reset removes the workspace, which deletes its two vhost files, and provisions it again, which renders the HTTP one;
   `reset.sh` then calls `enable-tls.sh --reuse-cert` (no request to Let's Encrypt, the certificate stays in
   `deploy/certbot/conf`) so the HTTPS vhosts are back at the same paths and the symlinks keep pointing at them. Between the
   removal and the end of the build the symlinks point at missing files: do not reload or restart the host nginx by hand in
   that window (a dangling link in `sites-enabled` makes `nginx -t` fail for every site), and renew the certificate with the
   weekly job, not during a reset.
4. **Check it from outside**: `scripts/sandbox/verify.sh https://<host> <demo e-mail> <demo password>` (limits, disabled
   features, read-only users, public settings; it deletes the test assets it uploads).
5. **Reset every 3 hours**: copy `scripts/sandbox/whoobe-sandbox.env.example` to `/etc/whoobe-sandbox.env` (mode 600) and
   fill in the variables of step 2 (a misspelled name is silently ignored); copy
   `scripts/sandbox/systemd/whoobe-sandbox-reset.service` and `.timer` to `/etc/systemd/system/`. If the clone is not in
   `/opt/whoobe_project`, or the user that owns it is not root, install the drop-in
   `scripts/sandbox/systemd/override.conf.example` as
   `/etc/systemd/system/whoobe-sandbox-reset.service.d/override.conf` (user and paths; running as the repository's owner
   keeps the generated files from belonging to root, and that user must be in the `docker` group). Then
   `systemctl daemon-reload`, `systemctl start whoobe-sandbox-reset.service` (a first reset, which deletes the sandbox's data)
   and `systemctl enable --now whoobe-sandbox-reset.timer`. Check with `systemctl list-timers 'whoobe*'` and
   `journalctl -u whoobe-sandbox-reset -n 40`. The service is stopped after 40 minutes and tried again after one: a
   dependency download that stalls does not leave the sandbox off until the next cycle. `reset.sh` takes a lock (a second
   reset exits at once), stops the `docker compose ... up` of a killed earlier reset, and on a stop signal terminates
   everything it started: a snap-installed Docker client is not stopped with its systemd service and would otherwise stay
   behind waiting, blocking the next attempt.
6. **Host firewall**: in, only 80 and 443. Out, keep 443 and DNS open: the allowed API (`dummyjson.com`) is behind a CDN whose
   addresses change, so the application list (`SANDBOX_ALLOW_HOSTS`) is the control, not an address filter. Not exercised yet
   on a public host.

To stop it: `./scripts/remove-workspace.sh sandbox --yes` (deletes the data, as every reset does).

## Who tried it: the visit log

The sandbox writes its own anonymous visit log, `/var/log/nginx/sandbox-access.log` on a host with nginx (not the host's shared
`access.log`, where every site is mixed and the host name is missing). `deploy/profiles/sandbox.nginx-http.conf` defines the format
and `WS_EDGE_LIMITS` in `deploy/profiles/sandbox.env` turns it on for the sandbox's vhosts. What it holds, one line per request:
time, **the address cut to its network** (IPv4 /24, IPv6 /48: `81.10.20.0`), method, **the path without the query string**, status,
time taken, referrer, browser. Static files and `/health` are not written. The host's logrotate keeps 14 days (daily, compressed).
Nobody is identified: tell visitors so on the page that links to the sandbox.

To leave your own visits out (or a monitor's), put the addresses in `SANDBOX_UNTRACKED_IPS` in `/etc/whoobe-sandbox.env`, space or
comma separated, CIDR ranges allowed (`203.0.113.7, 2001:db8::/48`). The next reset writes them into the `geo` list of
`deploy/nginx/00-sandbox-zones.conf` (an entry that is not an address is left out with a warning); then `sudo nginx -t && sudo systemctl
reload nginx` once outside the reset. Requests from those addresses still reach the sandbox; only the log skips them. Requests from
ClaudeBot are not written either (they were about half of the log: `robots.txt` and the sitemap); other robots are written and
counted apart by `visits.sh`. Lines written
before stay in the log until logrotate drops them (14 days).

Read it with `scripts/sandbox/visits.sh [days]` (on the host, or `ssh <host> 'cd /opt/whoobe/whoobe_cms && scripts/sandbox/visits.sh 7'`;
the user needs the `adm` group to read the log): requests, **visitors** (distinct network + browser, robots left out), **logins**
(successful sign-ins of the demo account), **active** (signed in and changed something), robot requests, where visitors came from
(referrer hosts) and the most requested pages. The figures are an order of magnitude, not a head count: people behind one address with
the same browser count once, one person on mobile data who changes network counts more than once.

The first time (a sandbox set up before the visit log existed): the next reset rewrites the profile files and the vhosts together;
then `sudo nginx -t && sudo systemctl reload nginx` once outside the reset (never during it, see step 3). With the containerised
proxy instead of host nginx the file is inside that container's `/var/log/nginx`.

## How the reset works

`scripts/sandbox/reset.sh` first builds the images with the running sandbox's env file (the slow part, minutes when the code
or the build context changed, seconds when everything is cached; the sandbox keeps serving meanwhile), then removes the workspace
with all its volumes (database and object store), provisions it again with new
random secrets and the demo account, and waits until `/health` reports the sandbox block. If anything fails the stack is
removed and the script exits non-zero: the sandbox stays off, it never keeps serving the previous cycle. Expect
under a minute of downtime (stop, start, migrations), whatever the build costs; the very first start, and a reset after a profile
change that alters a build argument, still build inside the provisioning. Because that second build happens after the workspace was
removed, the sandbox is **off for the whole of it**: after new code reaches the host, the first reset can leave it off for several
minutes (on 2026-10-20, on a 4-CPU arm64 host with a load of 8 to 12, the two builds together took more than 15 minutes and the
retry brought it back). That is why the service waits up to 40 minutes. The banner shows the next reset time.

**Disk.** Every reset builds again, and the build cache of the Docker daemon grows by gigabytes: on 2026-10-21 the host held 21.5 GB of it
on a 45 GB disk, and 20 GB again a day after a manual prune, because a cold deploy plus the 3-hourly builds leave only recent layers
(an age filter such as `until=48h` frees nothing then). Once the sandbox is up, `reset.sh` runs
`docker builder prune -f --reserved-space 4GB --max-used-space 8GB`: the cache is capped at 8 GB and the 4 GB most recently used stay,
so the next build is warm. These are the Docker 29 flags (`--keep-storage` no longer exists). The daemon is shared with the other
workspaces of the host, so their cache is capped too; images, volumes and containers are not touched. A failure of the prune is only reported.

**After a deploy**, start the reset yourself right away (`systemctl start whoobe-sandbox-reset.service`) instead of waiting for the
timer, and do it when nobody is expected: the first run after a code change is the slow one, the next ones use the cache.

## Known limits of this design

- `no-new-privileges` is on by default. With a snap-installed Docker (AppArmor) it makes images such as Postgres fail with
  `exec ... docker-entrypoint.sh: operation not permitted`; on such a host pass `SANDBOX_NO_NEW_PRIVILEGES=false` (in
  `/etc/whoobe-sandbox.env`), and prefer the Docker Engine packages for a public host.
- All visitors share one workspace: they see each other's content. Content is public for up to 3 hours, so moderate the page
  that advertises the sandbox accordingly and watch the host's bandwidth.
- Visitors can make the server call the allowed API from its address; the rate limits bound it, they do not remove it.
- The egress firewall and TLS have not been exercised yet; do it when the sandbox goes on a public host.
