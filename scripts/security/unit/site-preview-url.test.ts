// Where the dashboard sends the preview of a website's pages: the root path follows the origin directly, never
// /whoobe-one/ (that is where the editor's screens live).
import { describe, it, expect } from 'vitest'
import { computeSitePreviewBase } from '../../../apps/admin-dashboard/src/utils/site-preview-url'

const env = (o: Partial<Parameters<typeof computeSitePreviewBase>[0]>) => ({ protocol: 'https:', hostname: 'dashboard.example.com', port: '', ...o })

describe('computeSitePreviewBase', () => {
  it('a workspace: the dashboard\'s own origin, no /whoobe-one', () => {
    expect(computeSitePreviewBase(env({}))).toBe('https://dashboard.example.com')
    expect(computeSitePreviewBase(env({ protocol: 'http:', hostname: 'ws.lan', port: '8080' }))).toBe('http://ws.lan:8080')
  })
  it('local development: the editor\'s own port', () => {
    expect(computeSitePreviewBase(env({ protocol: 'http:', hostname: 'localhost', port: '3000' }))).toBe('http://localhost:3006')
    expect(computeSitePreviewBase(env({ protocol: 'http:', hostname: '127.0.0.1' }))).toBe('http://127.0.0.1:3006')
  })
  it('VITE_WHOOBE_ONE_URL: the editor\'s base without its /whoobe-one mount point', () => {
    expect(computeSitePreviewBase(env({ override: 'http://localhost:3106/whoobe-one' }))).toBe('http://localhost:3106')
    expect(computeSitePreviewBase(env({ override: 'https://cms.example.com/whoobe-one/' }))).toBe('https://cms.example.com')
    expect(computeSitePreviewBase(env({ override: 'https://editor.example.com' }))).toBe('https://editor.example.com')
    expect(computeSitePreviewBase(env({ override: '  ' }))).toBe('https://dashboard.example.com')
  })
})
