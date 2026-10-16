# Node-RED with Whoobe

Node-RED is a flow editor for wiring services together. Whoobe works with it through **object events** (a record is created, changed or published, and Node-RED is
told) and, if the flow should change the record, through an **API client**. Whoobe does not ship Node-RED, does not run it and does not support it: you install
it, secure it and respect its licence (Apache 2.0). Whoobe provides a ready *Integrations* entry, a step in the *Connect a flow* wizard and a working example.

## 1. The model: on the same machine, not exposed

Node-RED's editor can run code on the machine it is installed on, so it should never face the network. The setup Whoobe documents keeps it that way:

- **Node-RED runs on the host that runs Whoobe** (or on the same private Docker network) and publishes **no port** to the network.
- **The Gateway reaches it locally**: `http://localhost:1880` when the Gateway is not in Docker, `http://node-red:1880` over the Docker network when it is.
- **In production it has no editor and no admin API.** A flow is changed on your own machine, tested there, and only then copied to the host.

This is why the *Integrations* preset is called **Node-RED (this machine only)**: it points at `http://localhost:1880` and works only for a Node-RED on the same
machine as the Gateway. For a Node-RED on another host, add a normal endpoint (and put it behind HTTPS with authentication; that is outside this guide).

## 2. Connecting a flow

1. **In Node-RED**: a flow that starts with an *http in* node, method **POST**, path for example `/whoobe-events`, and answers with an *http response*.
   The example flow in the repository (`examples/automation-engines/node-red/data/flows.json`) does this, checks the call and writes a note back.
2. **In Whoobe**: *Object events > Connect a flow*, class and what starts the flow, URL `http://localhost:1880/whoobe-events` and, if the flow changes the
   record, tick *the flow writes back*. A URL on port `1880` is recognised as Node-RED; on any other port pick **Node-RED** in the *Engine* list.
   The wizard reuses the endpoint of the *Node-RED (this machine only)* preset if you added it, or creates one for the address.
3. **If the flow writes back**, the wizard creates an API client limited to that class and shows its key **once**, together with:
   - the **code of a Node-RED *function* node** that updates one field of the record that started the flow. `<FIELD>` and `<NEW VALUE>` are yours to replace;
   - the two **environment variables** the code reads, `WHOOBE_CLIENT_URL` (the Gateway's client API as the Node-RED container sees it) and `WHOOBE_KEY`.
   The key and the address live in the environment, never in the flow file, because the flow file goes to git.
4. **Send a test event** in the wizard. If Node-RED answers 404 the wizard says so in words: the path of the route and the path of the *http in* node differ
   (compare them letter by letter: `/whoobe-event` is not `/whoobe-events`).

The function node is followed by an *http request* node set to *use msg.method* with the answer as a parsed JSON object. In the example flow both are already wired.

## 3. What the flow receives, and what it can do

The body of the POST is the object event: `type`, `class.name`, `object.id` (and `key`, `locale`, `published`, `workflowState`), `changed` (the **names** of the fields
that changed), `actor` and `occurredAt`; the headers carry `X-Whoobe-Event-Id` (use it as the idempotency key: delivery is at least once), `X-Whoobe-Event-Type`
and `X-Whoobe-Timestamp`, and `X-Whoobe-Signature` when you configured a signing key. **The event has no field values.** To use the record's data, read it with an
*http request* (GET `<client API>/data/<class>/<id>` with the same key) before the node that writes.

Two rules of the API client apply to the flow: it changes **drafts only** (a published record answers 409) and only fields of its own class (400 if the field
does not exist). List the client in the subscription's *Ignore changes made by* so the flow's own write does not start it again; if two flows write to the same
class, list **both** clients in **both** subscriptions or they will start each other (see [object events](object-events.md), section 5).

## 4. Developing and deploying a flow

Change a flow **on your machine**, never on the server:

| | Development | Production |
|---|---|---|
| Editor and admin API | on `127.0.0.1:1880` only | **off** |
| Published port | `127.0.0.1` only | **none** |
| The flow | edited in the editor, saved into `data/flows.json` | that file, mounted read-only |
| Keys | a **test** API client | the real one, from an env file with mode 600 |

The example compose files (`docker-compose.dev.yml`, `docker-compose.prod.yml`) and the steps are in `examples/automation-engines/node-red/README.md`. The flow file is
written one node per line, so a change is a readable diff to review and commit. To deploy: copy the new `flows.json`, restart the container. The production
container has a read-only file system, drops every capability and refuses to start without the key and the signing secret.

## 5. Securing the entry

Not exposing Node-RED is the first protection. Node-RED does not authenticate the entry of a flow by itself, so the second is the **signature**: set a signing key
in the environment of the Gateway (`OBJECT_EVENTS_SECRET_<NAME>`), name it in the subscription (*Advanced*), and give the same value to the flow
(`WHOOBE_SIGNING_SECRET`); the example flow then refuses a call with a wrong or missing signature (401) or an old timestamp (400). Also: keep the API client's scope
to the one class the flow writes, rotate its key when someone who knew it leaves, and treat `flows.json` as code (review it before it reaches the host).

## 6. Troubleshooting

| What you see | Likely cause |
|---|---|
| The log says *answered HTTP 404* | the route's path is not the one of the *http in* node (check every letter and the leading `/`) |
| *Nothing is listening* / *not delivered* | Node-RED is stopped, or the Gateway runs in Docker and `localhost` is its own container: use the host's Docker address or the network name |
| *The Gateway refuses that address* | in production the Gateway refuses loopback: set `OUTBOUND_ALLOW_HOSTS=<host name>` or use the Docker network name |
| The flow runs but the record does not change | the field name is not in the class (400), the record is published (409), or `WHOOBE_KEY` / `WHOOBE_CLIENT_URL` is wrong (401 / unreachable) |
| The flow runs again and again | its client is not in *Ignore changes made by*, or another flow writes the same class |
| The editor does not open in production | by design: there is none |
