import { createLogger } from '@whoobe-cms/logger'
import type { Logger } from 'pino'

export const logger: Logger = await createLogger('gateway', {
  file: true,
  damUpload: true,
})

export function logGatewayError(context: string, err: unknown): void {
  logger.error({ err }, `[gateway] ${context} failed`)
}