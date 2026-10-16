// EXAMPLE ONLY - NOT PART OF THE WHOOBE DISTRIBUTION. A Windmill script (Bun) that receives a Whoobe object event and writes a note on the record.
// Path in Windmill: f/whoobe/on_event. Windmill passes the JSON body of the webhook as the arguments of main(); the names below are the event's own keys
// (the event also has `class`, a reserved word, so the class name is set in CLASS_NAME). Variables to create in the workspace:
//   f/whoobe/client_url  the Gateway's client API as the Windmill worker sees it, e.g. http://172.17.0.1:3001/client/v1
//   f/whoobe/key         the API client's key (a secret variable)
import * as wmill from 'windmill-client'

const CLASS_NAME = 'Contact'

export async function main(
  id: string,
  type: string,
  object?: { id: string; published?: boolean },
  changed?: string[],
  actor?: { type: string; id?: string },
  test?: boolean,
) {
  if (test || !object) return { skipped: 'test event' }
  const base = (await wmill.getVariable('f/whoobe/client_url')).replace(/\/+$/, '')
  const key = await wmill.getVariable('f/whoobe/key')
  const res = await fetch(`${base}/data/${encodeURIComponent(CLASS_NAME)}/${object.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributes: { notes: `processed by Windmill (${type}, event ${id.slice(0, 8)})` } }),
  })
  return { status: res.status, changed, by: actor?.type }
}
