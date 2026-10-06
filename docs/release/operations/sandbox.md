# Public sandbox

A demo instance anyone can try, with limits, that is deleted and rebuilt from nothing every 3 hours. It is the normal
product in **sandbox mode** (`SANDBOX_MODE=1`), run as one workspace named `sandbox` with the overlay
`docker-compose.sandbox.yml`.

## What visitors get

- One shared demo account (e-mail and password are public: put them on the page that links to the sandbox).
- The editor, the DAM, websites, pages, snippets, themes - everything that works inside the stack.
- A banner on every screen with the time of the next reset.

## Limits

| Limit | Value | Where |
|---|---|---|
| File size | 5 MB (`ASSET_MAX_FILE_BYTES`, answers 413) | asset-processor; nginx accepts 6 MB bodies |
| Number of assets | 50 (`ASSET_MAX_COUNT`, answers 409; overwriting an existing path is allowed) | asset-processor, uploads and `_edited` copies |
| Image dimensions | 16 megapixels (`ASSET_MAX_INPUT_PIXELS`) | sharp |
| JSON body | 1 MB (50 MB outside the sandbox) | asset-processor |
| Public API rate | 60/30/30 per minute (`PUBLIC_*_RATE_LIMIT_PER_MINUTE`) | core-api |
| Per address | 10 requests/s with a burst of 40, 20 connections, 60 s timeouts | nginx |
| Outbound HTTP | only `SANDBOX_ALLOW_HOSTS` (default `dummyjson.com`) | `safeFetch` |
| Containers | memory, CPU and process limits, no capabilities, read-only root file system for the Node services | `docker-compose.sandbox.yml` |

## Features that are off (answer 403 "disabled in the public sandbox")

AI (`/ai/*`), mail (`/mail-*`, and sending itself), the Figma import, the migration sources, the CDN mirror settings,
PWA generation, regenerating a website's gateway key. Outbound HTTP through `safeFetch` is refused for every host except
the ones listed in `SANDBOX_ALLOW_HOSTS` (exact host names, default `dummyjson.com`, a public dummy-data API so the API
Gateway can be demonstrated). The list is checked on every redirect hop and before any DNS lookup; a listed host still goes
through the normal SSRF checks (no private or loopback addresses). So a visitor can create gateway endpoints and routes,
but only towards the allowed hosts: Cloudinary, Brevo and CDN mirroring stay off. Set `SANDBOX_ALLOW_HOSTS=` (empty) to
turn all outbound HTTP off. The path list lives in `packages/core/src/sandbox.ts`.

## Run it

On a dedicated host with Docker Compose 2.24 or newer, a DNS name pointing to it and nothing else of value on it:

1. Clone the repository to `/opt/whoobe_project`, then create `/etc/whoobe-sandbox.env` with `SANDBOX_HOST=<host name>`
   (and optionally `SANDBOX_DEMO_EMAIL`, `SANDBOX_DEMO_PASSWORD`, `SANDBOX_INTERVAL_HOURS`, `SANDBOX_INDEX`).
2. `scripts/sandbox/reset.sh` once by hand; then turn on TLS with `scripts/enable-tls.sh`.
3. Install the timer: copy `scripts/sandbox/systemd/whoobe-sandbox-reset.service` and `.timer` to `/etc/systemd/system/`,
   `systemctl enable --now whoobe-sandbox-reset.timer`.
4. Firewall: allow only 80 and 443 in; allow out only DNS and what ACME needs. The stack never needs the internet.
5. Check it from outside: `scripts/sandbox/verify.sh https://<host> <demo e-mail> <demo password>`.

## How the reset works

`scripts/sandbox/reset.sh` removes the workspace with all its volumes (database and object store), provisions it again
with new random secrets and the demo account, and waits until `/health` reports the sandbox block. If anything fails the
stack is removed and the script exits non-zero: the sandbox stays off, it never keeps serving the previous cycle. Expect
about a minute of downtime; the banner shows the next reset time (`SANDBOX_RESET_AT`).

## Known limits of this design

- The demo account is the workspace administrator but, in the sandbox, users and roles are read-only for it (listing
  works; creating, changing, deleting, resetting a password and changing its own MFA answer 403), so visitors cannot lock
  each other out.
- `no-new-privileges` is on by default. With a snap-installed Docker (AppArmor) it makes images such as Postgres fail with
  `exec ... docker-entrypoint.sh: operation not permitted`; on such a host set `SANDBOX_NO_NEW_PRIVILEGES=false`
  (in `/etc/whoobe-sandbox.env`), and prefer the Docker Engine packages for a public host.
- All visitors share one workspace: they see each other's content. Content is public for up to 3 hours, so moderate the
  page that advertises the sandbox accordingly and watch the host's bandwidth.
- The egress firewall and TLS have not been exercised yet; do it when the sandbox goes on a public host.
