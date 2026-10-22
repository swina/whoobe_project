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

- **Installing without the internet.** The compose files have no `image:` for core-api, asset-processor, gateway, the dashboard and the editor,
  only `build:`, and `provision-workspace.sh` runs `up -d --build`. The released images (built from a tag by `release.yml`, signed and attested)
  cannot yet be used instead. Until that is done, a private installation needs a mirror of the npm registry and of the Debian and Alpine
  package repositories reachable from the build, or a build host that does have access, and the images then have to be moved by hand.
  `postgres`, `valkey` and `nginx` can be loaded with `docker save` / `docker load`.
- **The run itself**: a workspace on a host with no route out, started, passing `scripts/workspaces.sh verify` and the API suite.

## What to check on a first installation

1. `docker compose -p ws-<slug> ps`: every container healthy; `./scripts/workspaces.sh verify <slug>` exits 0.
2. Open the dashboard and the editor with the browser's network panel: no request to a host outside your network (the Office viewer and
   YouTube only when someone uses them).
3. Create a page from the wizard: pictures are the grey placeholder, not broken images.
4. Upload a `.woff2` in Settings > Custom fonts, use it in a page, publish: the generated site has the file under `public/fonts/`.
5. Restore a backup on a spare machine ([backup, restore and DR](backup-restore-and-dr.md)).
