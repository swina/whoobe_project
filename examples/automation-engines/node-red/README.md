# Node-RED: receive an object event and write back

**Example only, not part of the Whoobe distribution** (see [../README.md](../README.md)). Node-RED is Apache 2.0; installing and running it is your responsibility.

`whoobe-events-flow.json` is one flow: *POST /whoobe-events* receives the event, checks it (a fresh timestamp and, if you set a secret, the
`X-Whoobe-Signature`), answers `200` at once, and then writes a note on the record through an API client (`PATCH .../client/v1/data/<Class>/<id>`).
It handles the same event once (Whoobe delivers at least once).

## Try it

1. In Whoobe create an **API client** with `data:read:<Class>` and `data:write:<Class>` and copy its key.
2. Start Node-RED with the two variables the flow reads:

   ```bash
   docker run -d --name node-red -p 127.0.0.1:1880:1880 \
     -e WHOOBE_CLIENT_URL=http://<address of the Gateway as the container sees it>:3001/client/v1 \
     -e WHOOBE_KEY=wbk_... \
     -e WHOOBE_SIGNING_SECRET=<optional, same value as the subscription's secret> \
     nodered/node-red:4.1
   ```

   From inside Docker `localhost` is the container itself: use the host's address on the Docker bridge (often `172.17.0.1`) or the network name of the Gateway.
3. Import the flow: *menu > Import > whoobe-events-flow.json*, or `curl -X POST localhost:1880/flows -H 'content-type: application/json' -H 'Node-RED-Deployment-Type: full' --data @whoobe-events-flow.json`.
4. In Whoobe: **Object events > Connect a flow**, URL `http://<Node-RED address as the Gateway sees it>:1880/whoobe-events`, tick *the flow writes back*
   (it puts the API client in the subscription's *ignore changes made by* list, so the note does not start the flow again). To sign the events set
   `OBJECT_EVENTS_SECRET_<NAME>` on the Gateway and the same value in `WHOOBE_SIGNING_SECRET`, then name it in the subscription (*Advanced*).
5. Create a record: it gets the note *processed by Node-RED (...)*.

## What to know

- Node-RED does **not** authenticate this entry by itself. Without the signature check anyone who can reach the port can call it: set the secret, or protect the
  HTTP nodes with `httpNodeAuth` in Node-RED's `settings.js` (and put the credentials on the Whoobe endpoint).
- The signature is checked on the body as Node-RED parsed it and written back compactly; that matches what Whoobe sends. A body Node-RED reformats would fail
  the check, so keep the entry as it is.
- The API changes **drafts** only: a published record answers 409.
