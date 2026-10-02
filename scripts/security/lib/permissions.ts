// PERMISSIONS enum name -> key ("OBJECTS_READ" -> "objects:read"), parsed from the source of truth
// so the matrix cannot drift from the code.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT_DIR } from './config'

export const PERMISSION_KEYS: Record<string, string> = (() => {
  const src = readFileSync(resolve(ROOT_DIR, 'packages/core/src/auth/permissions.ts'), 'utf8')
  const out: Record<string, string> = {}
  for (const m of src.matchAll(/^\s+([A-Z][A-Z0-9_]*):\s*'([a-z_]+:[a-z_]+)'/gm)) out[m[1]] = m[2]
  return out
})()
