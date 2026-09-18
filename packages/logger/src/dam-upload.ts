import { createReadStream, unlinkSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const LOG_DIR = resolve(process.env.LOG_DIR ?? './logs')
const ASSET_PROCESSOR_URL = process.env.ASSET_PROCESSOR_URL ?? 'http://localhost:3002'
const DAM_SERVICE_TOKEN = process.env.DAM_SERVICE_TOKEN ?? ''

export async function uploadRotatedLog(
  appName: string,
  rotatedFilePath: string
): Promise<void> {
  if (!existsSync(rotatedFilePath)) return

  const stats = await import('node:fs').then(fs => {
    try { return fs.statSync(rotatedFilePath) } catch { return null }
  })
  if (!stats || stats.size === 0) return

  const filename = rotatedFilePath.split('/').pop() ?? `${appName}.log`
  const dateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/)
  const yearMonth = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}` : new Date().toISOString().slice(0, 7)
  const folder = `private/logs/${appName}/${yearMonth}/`

  try {
    const { readFileSync } = await import('node:fs')
    const buffer = readFileSync(rotatedFilePath)

    const formData = new FormData()
    const blob = new Blob([buffer], { type: 'text/plain' })
    formData.append('file', blob, filename)
    formData.append('pimcorePath', folder + filename)
    formData.append('isPublic', 'false')
    formData.append('folder', folder)

    const headers: Record<string, string> = {}
    if (DAM_SERVICE_TOKEN) {
      headers['Authorization'] = `Bearer ${DAM_SERVICE_TOKEN}`
    }

    const response = await fetch(`${ASSET_PROCESSOR_URL}/api/v1/dam/upload`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`[logger] DAM upload failed for ${filename}: ${response.status} ${text}`)
      return
    }

    if (existsSync(rotatedFilePath)) {
      unlinkSync(rotatedFilePath)
    }
  } catch (error) {
    console.error(`[logger] DAM upload error for ${filename}:`, error)
  }
}

export async function listLogFiles(
  appName: string,
  yearMonth?: string
): Promise<{ filename: string; path: string; size: number; uploadedAt?: string }[]> {
  const folderPrefix = yearMonth
    ? `private/logs/${appName}/${yearMonth}/`
    : `private/logs/${appName}/`

  try {
    const url = new URL(`${ASSET_PROCESSOR_URL}/api/v1/dam/assets`)
    url.searchParams.set('folderPath', folderPrefix)

    const headers: Record<string, string> = {}
    if (DAM_SERVICE_TOKEN) {
      headers['Authorization'] = `Bearer ${DAM_SERVICE_TOKEN}`
    }

    const response = await fetch(url.toString(), { headers })
    if (!response.ok) return []

    const data = await response.json()
    return (data.assets ?? []).map((a: any) => ({
      filename: a.filename,
      path: a.pimcorePath,
      size: a.sizeBytes,
      uploadedAt: a.createdAt,
    }))
  } catch {
    return []
  }
}

export async function downloadLogFile(pimcorePath: string): Promise<string | null> {
  try {
    const url = new URL(`${ASSET_PROCESSOR_URL}/api/v1/dam/asset-urls`)
    url.searchParams.set('pimcorePath', pimcorePath)

    const headers: Record<string, string> = {}
    if (DAM_SERVICE_TOKEN) {
      headers['Authorization'] = `Bearer ${DAM_SERVICE_TOKEN}`
    }

    const response = await fetch(url.toString(), { headers })
    if (!response.ok) return null

    const data = await response.json()
    if (!data.url) return null

    const contentResponse = await fetch(data.url)
    if (!contentResponse.ok) return null

    return contentResponse.text()
  } catch {
    return null
  }
}