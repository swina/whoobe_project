# Local experiment: a Whoobe form calling Activepieces (MIT alternative to n8n)

*Date: 2026-10-11. **Tried and working** (form -> Gateway -> flow; e-mail through Mailhog and the `outcome` reaching the page, same as with n8n). Companion of [n8n-local-experiment.md](n8n-local-experiment.md); the Whoobe side is identical.*

**Licence note.** Activepieces is MIT licensed, except the code under `packages/ee/` (and `packages/server/api/src/app/ee`), which has
a commercial licence (SSO, audit log, advanced permissions, the Embed SDK that puts the flow editor inside another product).
Calling it from Whoobe through a Gateway endpoint needs none of that, and the MIT core could be shipped in a sample compose
file. The name and logo are Activepieces trademarks. Re-check `LICENSE` of the version you use; each *piece* (integration) is an
npm package with its own licence.

## 1. Run it locally (single container, no Postgres or Redis)

```bash
docker volume create whoobe-activepieces-test
docker run -d --name whoobe-activepieces-test --restart unless-stopped \
  -p 127.0.0.1:8090:80 -v whoobe-activepieces-test:/root/.activepieces \
  -e AP_JWT_SECRET="$(openssl rand -hex 32)" -e AP_ENCRYPTION_KEY="$(openssl rand -hex 16)" \
  -e AP_DB_TYPE=PGLITE -e AP_REDIS_TYPE=MEMORY -e AP_FRONTEND_URL=http://localhost:8090 \
  activepieces/activepieces:latest
```

- Tried with the image current on 2026-10-11. `AP_JWT_SECRET` is needed: the image derives the worker token from it, without it the
  worker restarts in a loop (`AP_WORKER_TOKEN is a required variable`).
- **Keep the same `AP_JWT_SECRET` and `AP_ENCRYPTION_KEY` when you recreate the container**, otherwise stored connections cannot
  be decrypted. Put them in an env file (`--env-file`, mode 600) instead of generating them inline for anything you want to keep.
- `PGLITE` + `MEMORY` is a single-instance mode for trials; for real use follow Activepieces' PostgreSQL + Redis setup.
- Bound to `127.0.0.1`. Open `http://localhost:8090` and create the first account.

- Shortcut: `examples/automation-engines/automation-test.sh` starts or stops it (toggle; `n8n` as argument does the same for n8n). It reads the two secrets from
  `~/.config/whoobe/activepieces.env`.
- The **SMTP piece** only offers the ports 25, 465, 587 and 2525 (a fixed list in `@activepieces/piece-smtp` 0.5.0). For a fake SMTP
  server on another port (Mailhog 1025) the script also runs `whoobe-smtp-forward`, which forwards 2525 to it: in the piece use host
  `whoobe-smtp-forward`, port `2525`, TLS off.

## 2. The flow

1. New flow, trigger **Webhook** (Catch Webhook). Copy its **live** URL (`http://localhost:8090/api/v1/webhooks/<flow id>`; the
   *test* URL ends in `/test` and only works while the editor waits for a sample).
2. Add the action **Return Response** (Webhook piece), status `200`, type JSON, body `{ "outcome": "qualified" }`; to decide, put a
   **Branch** before it with a Return Response per branch (the form data is under `trigger.body`).
3. Publish the flow (it only answers when published).

## 3. In Whoobe

Same as the n8n guide: Integrations > new endpoint with base URL `http://localhost:8090`, route `POST /api/v1/webhooks/<flow id>`,
form action *Gateway*. The Gateway reads `outcome` from the reply and the page reacts as in [form-result-event.md](form-result-event.md).
Nothing in Whoobe is specific to the vendor.

## 4. Clean up

```bash
docker rm -f whoobe-activepieces-test && docker volume rm whoobe-activepieces-test
```
