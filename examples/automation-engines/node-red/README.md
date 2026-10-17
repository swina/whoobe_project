# Node-RED: receive an object event and write back, developed locally and run unexposed

**Example only, not part of the Whoobe distribution** (see [../README.md](../README.md)). The guide is [Node-RED with Whoobe](../../../docs/release/communication/node-red.md). Node-RED is Apache 2.0; installing, running and securing it is your responsibility.

The flow in `data/flows.json`: *POST /whoobe-events* receives the event, checks it (a fresh timestamp and, if you set a secret, the `X-Whoobe-Signature`),
answers `200` at once, then writes a note on the record through an API client (`PATCH .../client/v1/data/<Class>/<id>`). It handles the same event once
(Whoobe delivers at least once). `data/settings.js` is shared by both setups below.

## The idea: edit on your machine, run unexposed on the server

| | Development (`docker-compose.dev.yml`) | Production (`docker-compose.prod.yml`) |
|---|---|---|
| Where | your machine | the host that runs Whoobe |
| Editor and admin API | on `127.0.0.1:1880` only | **off** (`httpAdminRoot: false`): no editor, no `/flows` API |
| Published port | `127.0.0.1` only | **none**: reachable only on the Docker network of Whoobe |
| The flow | edited in the editor, saved into `./data/flows.json` | the file `./data/flows.json`, mounted **read-only** |
| Credentials | a **test** API client | the real one, from an env file (mode 600), never in git |
| Container | normal | read-only root, all capabilities dropped, `no-new-privileges` |

A change to a flow is made and tested in development, committed (`flows.json` is written one node per line, so the diff is readable), copied to the host
and applied with `docker compose -f docker-compose.prod.yml restart node-red`. Nobody edits a flow on the server.

## Development

1. In Whoobe create an **API client** with `data:read:<Class>` and `data:write:<Class>` (a test one) and copy its key.
2. `cp .env.example .env`, fill it (`WHOOBE_CLIENT_URL` is the Gateway's client API **as the container sees it**: from inside Docker `localhost` is the
   container itself; use the host's address on the Docker bridge, often `172.17.0.1`), then
   `docker compose -f docker-compose.dev.yml --env-file .env up -d`. The editor is on <http://127.0.0.1:1880>.
3. In Whoobe: **Object events > Connect a flow**, URL `http://localhost:1880/whoobe-events` (as the Gateway sees it), tick *the flow writes back*. To sign the
   events set `OBJECT_EVENTS_SECRET_<NAME>` on the Gateway and the same value in `WHOOBE_SIGNING_SECRET`, then name it in the subscription (*Advanced*).
4. (The function node that writes back should set the header `X-Whoobe-Flow: stop` on its request, as the wizard's script does: Whoobe then starts no flow because of that write.) Create a record of that class (a draft): its `notes` field becomes *Node-Red update this field* (the field and the text are set in the "build the PATCH" node). Change the flow in the editor, *Deploy*, try again.
5. `git diff data/flows.json`, commit. (`data/` keeps the editor's own files out of git: see `.gitignore`.)

## Production

1. Copy this folder's `docker-compose.prod.yml` and `data/flows.json` and `data/settings.js` to the host. Create `prod.env` (mode 600): `WHOOBE_NETWORK` (the Docker
   network of the Whoobe stack, see `docker network ls`), `WHOOBE_CLIENT_URL` (for example `http://gateway:3001/client/v1`), `WHOOBE_KEY` and
   `WHOOBE_SIGNING_SECRET` (the same value as the Gateway's `OBJECT_EVENTS_SECRET_<NAME>`).
2. `docker compose -f docker-compose.prod.yml --env-file prod.env up -d`.
3. In Whoobe: an Integrations endpoint with the base URL `http://node-red:1880` and a POST route `/whoobe-events`, or **Connect a flow** with
   `http://node-red:1880/whoobe-events`. The Gateway reaches it over the private network (private ranges are open to the Gateway unless
   `OUTBOUND_ALLOW_PRIVATE=false`; if you closed them, allow the host with `OUTBOUND_ALLOW_HOSTS=node-red`).
4. Keep the API client of the production flow to the one class it writes, and list it in the subscription's *Ignore changes made by*.

## What was checked (2026-10-16)

On a copy of the development database, Whoobe's core-api and gateway on other ports and Node-RED 4.1 in Docker:

- **Development**: the editor and the admin API answer on `127.0.0.1` only; a change deployed through the API is written to `data/flows.json`; with `flowFilePretty`
  a one-node change is a one-line diff; a real, signed event arrives, is answered and writes the note.
- **Production**: no published port (`docker port` is empty, the host's `localhost` refuses); from another container on the network `/`, `/flows`, `/settings` and
  `/auth/login` answer 404; the flow file and the root file system are read-only; the Gateway delivers a signed event to the container's address on that network
  and the record gets the note; copying a changed `flows.json` and restarting applied the change.

## What to know

- Node-RED does **not** authenticate the entry of a flow by itself. Not exposing it is the first protection; the signature check in the flow is the second
  (without `WHOOBE_SIGNING_SECRET` anyone who can reach the port can call it). In production the compose file refuses to start without it.
- The signature is checked on the body as Node-RED parsed it and written back compactly, which is how Whoobe sends it.
- The API changes **drafts** only: a published record answers 409.
- Two flows on the same class can start each other: list every automation's API client in each subscription's *ignore changes made by*.
- The dev compose runs the container as UID 1000 so it can write into `./data`; change `NODE_RED_UID` / `NODE_RED_GID` if yours differs.
