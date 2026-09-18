import type { LoggerConfig } from './types.js'
import { initLogger } from './transports.js'

export type { LoggerConfig, LogLevel } from './types.js'
export { listLogFiles, downloadLogFile } from './dam-upload.js'
export { createBrowserLogger } from './browser-logger.js'

export async function createLogger(appName: string, config: LoggerConfig = {}) {
  const logger = await initLogger(appName, config)
  return logger
}

export default createLogger