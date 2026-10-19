// Thin HTTP client for apps/core-api's /object-event-subscriptions and /object-event-deliveries
// (docs/plans/datamodel/data-objects-automations.md). Admin only (`object_events:manage`).
import { getDefaultCoreApiUrl } from './auth-api'

// Data objects, files in the library and pages share the same subscriptions, outbox and delivery log (docs/plans/system/more-events-plan.md).
export type ObjectEventType =
  | 'object.created' | 'object.updated' | 'object.published' | 'object.unpublished' | 'object.deleted' | 'object.transitioned' | 'object.bulk'
  | 'asset.created' | 'asset.updated' | 'asset.moved' | 'asset.deleted' | 'asset.bulk'
  | 'page.published' | 'page.unpublished'

export interface ObjectEventSubscription {
  id: string
  name: string
  enabled: boolean
  classId: string | null
  events: ObjectEventType[]
  endpointId: string | null
  routeId: string | null
  payloadMode: 'minimal'
  ignoreActors: string[]
  signingSecretRef: string | null
  createdAt: string
  updatedAt: string
  /** When the loop guard last stopped a delivery of this subscription (last 24 h), else null. */
  loopGuardFiredAt?: string | null
}

export interface ObjectEventSubscriptionInput {
  name: string
  enabled: boolean
  classId: string | null
  events: ObjectEventType[]
  endpointId: string
  routeId: string
  ignoreActors: string[]
  signingSecretRef: string | null
}

export type DeliveryStatus = 'pending' | 'delivered' | 'retrying' | 'dead' | 'stopped'

export interface ObjectEventDelivery {
  id: string
  status: DeliveryStatus
  attempts: number
  nextAttemptAt: string
  lastError: string | null
  deliveredAt: string | null
  createdAt: string
  event: { id: string; type: ObjectEventType; occurredAt: string; objectId: string | null; test: boolean }
}

function base(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
}

async function parse(res: Response): Promise<any> {
  if (!res.ok) {
    let message = res.status === 403 ? 'You need the permission "object_events:manage" for this' : `Request failed with status ${res.status}`
    try { const body = await res.json(); if (body?.error) message = body.error } catch { /* generic message */ }
    throw new Error(message)
  }
  return res.json()
}

const json = { 'content-type': 'application/json' }

export async function listSubscriptions(baseUrl: string): Promise<ObjectEventSubscription[]> {
  return (await parse(await fetch(`${base(baseUrl)}/object-event-subscriptions`, { credentials: 'include' }))).subscriptions
}

export async function createSubscription(baseUrl: string, input: ObjectEventSubscriptionInput): Promise<ObjectEventSubscription> {
  return (await parse(await fetch(`${base(baseUrl)}/object-event-subscriptions`, { method: 'POST', credentials: 'include', headers: json, body: JSON.stringify(input) }))).subscription
}

export async function updateSubscription(baseUrl: string, id: string, input: Partial<ObjectEventSubscriptionInput>): Promise<ObjectEventSubscription> {
  return (await parse(await fetch(`${base(baseUrl)}/object-event-subscriptions/${id}`, { method: 'PATCH', credentials: 'include', headers: json, body: JSON.stringify(input) }))).subscription
}

export async function deleteSubscription(baseUrl: string, id: string): Promise<void> {
  await parse(await fetch(`${base(baseUrl)}/object-event-subscriptions/${id}`, { method: 'DELETE', credentials: 'include' }))
}

export async function sendTestEvent(baseUrl: string, id: string): Promise<void> {
  await parse(await fetch(`${base(baseUrl)}/object-event-subscriptions/${id}/test`, { method: 'POST', credentials: 'include', headers: json, body: '{}' }))
}

export async function listDeliveries(baseUrl: string, id: string, status?: DeliveryStatus, limit = 50, type?: ObjectEventType): Promise<ObjectEventDelivery[]> {
  const q = new URLSearchParams({ limit: String(limit), ...(status ? { status } : {}), ...(type ? { type } : {}) })
  return (await parse(await fetch(`${base(baseUrl)}/object-event-subscriptions/${id}/deliveries?${q}`, { credentials: 'include' }))).deliveries
}

export async function retryDelivery(baseUrl: string, id: string): Promise<void> {
  await parse(await fetch(`${base(baseUrl)}/object-event-deliveries/${id}/retry`, { method: 'POST', credentials: 'include', headers: json, body: '{}' }))
}

/** Clears finished deliveries from the log: the given ids, or all with one status. Pending and retrying ones are never removed. Returns how many. */
export async function clearDeliveries(baseUrl: string, id: string, sel: { ids: string[] } | { status: 'delivered' | 'dead' | 'stopped' }): Promise<number> {
  return (await parse(await fetch(`${base(baseUrl)}/object-event-subscriptions/${id}/deliveries`, { method: 'DELETE', credentials: 'include', headers: json, body: JSON.stringify(sel) }))).removed
}
