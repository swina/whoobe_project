# Installing on a private network

For a VPN, a LAN or an air-gapped site: the workspace must work although nothing can reach the internet. This page says what the stack
asks of the internet, what the `private` profile changes, and what is **not** solved yet. It was written from reading the code and from
the pieces tried one by one. **Tried on 2026-10-22** on a throwaway workspace (provisioned with `--profile private`, then removed): the profile values reach `.env.<slug>`, the five images build from the working tree and the seven containers are healthy (`workspaces.sh status`); the built dashboard has no reference to Google Fonts, unsplash or picsum and carries Inter; the editor keeps only the code paths for fonts a theme names and for the picsum default; a woff2 uploaded to the DAM is checked, registered, listed, and copied by the site generator's font step (the copy is byte-identical). **A stack with no route out has not been run**, so the last section is the list of what to check.

## What the stack asks of the internet

| When | What | What to do |
|---|---|---|
| Starting a workspace | nothing: no call to the internet was found in core-api, gateway or asset-processor at start | |
| Running | only what an operator configures: AI providers, mail providers, OneSignal, Cloudflare Images, Figma. All are off until configured | leave them unconfigured, or point them at services on your network (an AI model, a mail relay) |
| In the dashboard and the editor | Inter and the icons ship with the apps. Fonts a theme names, and the build-time list `VITE_FONT_FAMILIES`, come from Google Fonts | the profile empties `VITE_FONT_FAMILIES`; upload the fonts you need in **Settings > Custom fonts** (see [settings guide](../settings/settings-guide.md)) |
| Placeholder pictures | generated pages and the editor's starter image used a photo from `picsum.photos` | the profile sets `PLACEHOLDER_IMAGES=local` and `VITE_PLACEHOLDER_IMAGES=local`: a flat grey picture carried by the code |
| Image fallback in the DAM | a stock photo from `unsplash.com` (changed for everybody: it is now a grey picture carried by the app) | |
| DAM preview of Word/Excel/PowerPoint files | opens the file in Microsoft's online viewer (`view.officeapps.live.com`), which also **sends the file's address to Microsoft** | not available without internet; do not use it where that matters |
| A page that embeds a YouTube video | the visitor's browser loads the YouTube player | the author's choice; do not embed on a private site |
| Installing and building | the images are **built from source** (`pnpm install` reads the npm registry; the Dockerfile runs `apt-get` and `apk`), and the compose files pull `postgres`, `valkey` and `nginx` by name | see "Not solved yet" |
| TLS | Let's Encrypt needs the internet | use a certificate of your own CA (below) |

## The `private` profile

```bash
./scripts/provision-workspace.sh <slug> <hostname> <index> --scheme https --profile private
```

It appends `deploy/profiles/private.env` to the workspace's env file: `VITE_FONT_FAMILIES=` (empty), `PLACEHOLDER_IMAGES=local`,
`VITE_PLACEHOLDER_IMAGES=local` and `OUTBOUND_ALLOW_PRIVATE=true`. The last one is the default; it is written down so that the choice is
visible. On a private network a model, a mail relay or a data source on a private address is the normal case; set it to `false` and list
the hosts that remain reachable in `OUTBOUND_ALLOW_HOSTS` if authors are not fully trusted ([configuration reference](configuration-reference.md)).
Everything the profile sets can be changed with `--set KEY=VALUE`. The `VITE_` values are read when the images are built.

## TLS from your own certificate authority

`enable-tls.sh` asks Let's Encrypt, which needs a public host name. For a certificate of your own CA, put the files where the HTTPS vhost
reads them and render the vhosts without asking anyone:

```bash
mkdir -p deploy/certbot/conf/live/<hostname>
cp fullchain.pem privkey.pem deploy/certbot/conf/live/<hostname>/      # the certificate with its chain, and the key
chmod 600 deploy/certbot/conf/live/<hostname>/privkey.pem
./scripts/enable-tls.sh <slug> --reuse-cert
```

`--reuse-cert` no longer checks that the host name looks public (that check is about Let's Encrypt reaching the host). Renewal is yours:
replace the two files and reload the proxy. The browsers of your users must trust the CA.

## Not solved yet

- **Installing without the internet.** Released images can be used instead of a build (2026-10-22): `provision-workspace.sh <slug> <host> <index> --profile private --image-prefix registry.internal/whoobe --image-version 0.3.0` starts the five application images as `<prefix>-core-api:0.3.0`, `-asset-processor`, `-gateway`, `-admin-dashboard` and `-whoobe-one-spike`, pulled when missing (or already loaded with `docker load`), and builds nothing. `workspaces.sh upgrade v0.3.1` moves such a workspace to the next version the same way. The dashboard and the editor take their addresses, fonts and placeholder mode from the environment at start, so one image serves every workspace. What a private host still needs: the images and `postgres`, `valkey` and `nginx` moved in with `docker save` / `docker load` or a registry mirror, and the Garage image (`docker build ./docker/garage` on a host with access, then save/load; the script builds it when it is missing, which needs the `dxflrs/garage` and `alpine` base images). Not done: the release workflow publishing the two new images has not run yet, and `provision-workspace.sh` was tried with images built locally and tagged by hand, not with ones pulled from a registry.
- **The run itself** (2026-10-22): a stack on a Docker network created with `internal: true` (`scripts/security/offline.override.yml`: `SEC_COMPOSE_FILE=... stack.sh up` for the security stack, `--set COMPOSE_FILE=docker-compose.yml:<override>` for a workspace). The containers had no default route, public names did not resolve (`EAI_AGAIN`) and `1.1.1.1` was unreachable. Docker does not publish ports of such a network, so `scripts/security/internal-bridge.sh` runs one forwarding container on that network and on the default bridge; the stack's own containers stay isolated. Results: `workspaces.sh verify` exits 0 (7/7 healthy, health ok); the API suite on the isolated stack: **2335 tests, 44 failed in the first run, and none of the failures was a call to the internet**: 2 were real bugs of the nginx template (below), 6 an old test env file without `MAIL_SETTINGS_ENCRYPTION_KEY` (passed after adding it), and 36 (`cdn-mirror`, `cdn-origin`, `oidc-login`) need the stack to call a mock server on the host, which an isolated network forbids by design; those 49 tests pass on the same stack on a normal network. The dashboard and the editor were then opened in Chromium (Playwright) on a workspace of this kind, through the shared nginx proxy on port 80: `/config.js` carried the workspace's addresses, login and the dashboard routes worked, the editor drew its starter image as the local grey picture, and **every request of the whole session went to `localhost`** (no external host, no failed request, no page error). An uploaded woff2 registered through `POST /fonts` appeared as an `@font-face` in the editor, was fetched from `/dam-asset/...` and loaded by the browser. Not done: a site generation, real mail and AI, TLS. Seen on the way, not specific to a private network, and fixed (2026-10-22): behind the workspace nginx a direct load or refresh of `/settings`, `/pages` or `/documents` answered from core-api instead of the dashboard; the template now sends browser navigations to those three paths to the dashboard (`CHANGES.md`; an existing workspace needs `scripts/render-workspace-nginx.sh <slug>` and an nginx reload).

## What to check on a first installation

1. `docker compose -p ws-<slug> ps`: every container healthy; `./scripts/workspaces.sh verify <slug>` exits 0.
2. Open the dashboard and the editor with the browser's network panel: no request to a host outside your network (the Office viewer and
   YouTube only when someone uses them).
3. Create a page from the wizard: pictures are the grey placeholder, not broken images.
4. Upload a `.woff2` in Settings > Custom fonts, use it in a page, publish: the generated site has the file under `public/fonts/`.
5. Restore a backup on a spare machine ([backup, restore and DR](backup-restore-and-dr.md)).
