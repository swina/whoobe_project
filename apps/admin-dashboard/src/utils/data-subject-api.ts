import { getDefaultCoreApiUrl } from './auth-api'

// Data subject requests and retention (docs/plans/system/data-subject-plan.md). Permission data_subject:manage.

export interface SubjectObject { id: string; classId: string; className: string; key: string; locale: string; published: boolean; createdAt: string; fields: string[] }
export interface SubjectMail { id: string; to: string; subject: string; status: string; sentAt: string; matchedIn: 'recipient' | 'content' }
export interface SubjectFile { id: string; submissionId: string; assetId: string | null; originalName: string; size: number | null; status: string }
export interface SubjectStaff { id: string; email: string; displayName: string; isActive: boolean }

export interface SubjectSearch {
  counts: { objects: number; mail: number; files: number; staff: number }
  objects: SubjectObject[]
  mail: SubjectMail[]
  files: SubjectFile[]
  staff: SubjectStaff[]
}

export interface SubjectErasure {
  dryRun: boolean
  objectsDeleted: number
  filesDeleted: number
  uploadRowsDeleted: number
  mailDeleted: number
  failures: { objectId: string; reason: string }[]
  matched: { objects: number; mail: number; files: number; staff: number }
}

export interface RetentionRun { classes: { classId: string; className: string; days: number; deleted: number; failed: number }[]; mailDeleted: number }

export interface SubjectOptions { includeMailBodies?: boolean }

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // Ignore body parse failures; use the generic message above.
    }
    throw new Error(message)
  }
  return res.json()
}

const post = (baseUrl: string, path: string, body: unknown) =>
  fetch(`${normalizeBaseUrl(baseUrl)}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' })

export async function searchSubject(baseUrl: string, identifier: string, opts: SubjectOptions = {}): Promise<SubjectSearch> {
  return parseJsonOrThrow(await post(baseUrl, '/data-subject/search', { identifier, ...opts }))
}

/** The export as a file the browser saves: the name comes from the server (a fingerprint, never the identifier). */
export async function exportSubject(baseUrl: string, identifier: string, opts: SubjectOptions = {}): Promise<{ blob: Blob; filename: string }> {
  const res = await post(baseUrl, '/data-subject/export', { identifier, ...opts })
  if (!res.ok) await parseJsonOrThrow(res)
  const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'data-subject.json'
  return { blob: await res.blob(), filename }
}

export async function eraseSubject(baseUrl: string, identifier: string, opts: SubjectOptions & { dryRun: boolean; confirm?: string; include?: { objects?: boolean; mail?: boolean } }): Promise<SubjectErasure> {
  return parseJsonOrThrow(await post(baseUrl, '/data-subject/erase', { identifier, ...opts }))
}

export async function runRetention(baseUrl: string): Promise<RetentionRun> {
  return parseJsonOrThrow(await post(baseUrl, '/data-subject/retention/run', {}))
}
