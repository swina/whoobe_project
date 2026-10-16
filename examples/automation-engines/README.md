# Automation engines: examples, not part of Whoobe

Whoobe does **not** ship, recommend or support any automation engine. Forms with an `outcome` and object events only send an HTTP call
to a webhook; what answers it (Activepieces, n8n, Make, a Node.js service of your own) is your choice, and installing it, reaching it from the
Gateway and respecting its licence are your responsibility. Each engine keeps its own runs; Whoobe keeps none.

This folder holds what the project used to **try** the integration on a development machine:

| File | What it is |
|---|---|
| `docker-compose.activepieces.yml` | Activepieces (MIT core) with PostgreSQL and Redis, bound to `127.0.0.1` |
| `node-red/` | a Node-RED flow that receives an object event, checks it, answers and writes back; with a README |
| `windmill/docker-compose.yml` | a reduced Windmill (Community Edition) for a development machine, with the way to connect it in its README |
| `automation-test.sh` | starts or stops a single-container Activepieces (or n8n) next to a development stack |

They are **excluded** from the deployment (`deploy.sh`) and from the Docker build context, are not part of a release, and are given without support.
See [the administrators' guides](../../docs/release/communication/automations-architecture.md) for how Whoobe talks to an engine.
