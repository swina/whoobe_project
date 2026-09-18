import { fileURLToPath } from 'node:url'
import { resolve, isAbsolute } from 'node:path'

// packages/logger/src/paths.ts -> repo root (three levels up).
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * Resolves LOG_DIR to a single, stable directory shared by every service,
 * regardless of each process's own cwd. A relative LOG_DIR (the default,
 * "./logs") is resolved against the repo root rather than process.cwd(),
 * so all apps write into the same top-level logs/ folder instead of each
 * one creating its own scattered copy under its own working directory.
 */
export function resolveLogDir(): string {
  const configured = process.env.LOG_DIR ?? './logs'
  return isAbsolute(configured) ? configured : resolve(REPO_ROOT, configured)
}
