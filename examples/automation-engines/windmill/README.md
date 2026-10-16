# Windmill: receive an object event and write back

**Example only, not part of the Whoobe distribution** (see [../README.md](../README.md)). Windmill Community Edition is AGPLv3 with some proprietary
parts: read its licence; installing and running it is your responsibility.

`docker-compose.yml` is a reduced Windmill (database, server, one worker, one native worker; tag pinned). `on_event.ts` is a Bun script that receives
an object event and writes a note on the record through an API client. Tried on 2026-10-16 with Windmill `1.837.0`.

## Try it

1. Start it: `WM_DB_PASSWORD=$(openssl rand -hex 16) docker compose -f examples/automation-engines/windmill/docker-compose.yml up -d`, open
   `http://127.0.0.1:8100`, sign in as `admin@windmill.dev` / `changeme` and change the password; create a **workspace** (this file's examples use `demo`).
2. In Whoobe create an **API client** with `data:read:<Class>` and `data:write:<Class>` and copy its key.
3. In the Windmill workspace create a folder `whoobe`, two variables `f/whoobe/client_url` (the Gateway's client API as the Windmill *worker* sees it, for
   example `http://172.22.0.1:3001/client/v1`: the address of the host on the compose network, found with `docker network inspect
   whoobe-windmill-example_default`) and `f/whoobe/key` (secret: the API client's key), and a script `f/whoobe/on_event` with the content of `on_event.ts`
   (set `CLASS_NAME` in it).
4. Create a Windmill **token** (Account settings > Tokens). In Whoobe, **Integrations**: an endpoint with the base URL of Windmill as the *Gateway* sees it
   (`http://localhost:8100` when the Gateway is not in Docker), authentication **Bearer** and that token. The token is stored encrypted and never shown again.
5. **Object events > Connect a flow**, URL `http://localhost:8100/api/w/demo/jobs/run/p/f/whoobe/on_event`, tick *the flow writes back*. The wizard reuses the
   endpoint with the same base URL and adds the route and the subscription, with the API client in *ignore changes made by*.
6. Create a record of that class: it gets the note *processed by Windmill (...)*.

## What to know

- **The token is on the endpoint, not in the path.** Windmill authenticates a webhook with a token, so the route path stays clean (compare an engine that
  puts a secret in its URL: that path is stored as plain text, see the administrators' guide).
- **Asynchronous or waiting.** `.../jobs/run/p/<path>` returns a job id at once; `.../jobs/run_wait_result/p/<path>` waits for the script and returns its result.
  An object event needs only the first: the answer is never read.
- **The event's keys become the script's arguments.** The event has a key `class`, a reserved word in TypeScript, so the script cannot name it as a parameter:
  the class name is a constant in the script.
- **Two flows on the same class can start each other.** If another connection also reacts to changes of this class, its writes are not ignored by this one
  and the two can loop (seen while preparing this example). List **every** automation's API client in each subscription's *ignore changes made by*.
- The reduced compose file does not enable Windmill's PID isolation (it needs a privileged worker): do not run code you do not trust in it.
