import { createLogger, attachLoggingToggle } from '@whoobe-cms/logger'
import { isLoggingEnabled } from '@whoobe-cms/core/server'
import type { Logger } from 'pino'

export const logger: Logger = await createLogger('gateway', {
  file: true,
  damUpload: true,
})

// Relies on config.ts's loadRootEnv() having already run by the time this
// module's top-level code executes - true today because every import path
// into this file passes through proxy-engine.ts/router.ts, which import
// config.js first.
attachLoggingToggle(logger, isLoggingEnabled)

export function logGatewayError(context: string, err: unknown): void {
  logger.error({ err }, `[gateway] ${context} failed`)
}