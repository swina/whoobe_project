export type BrowserLogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface BrowserLogger {
  error(payload: Record<string, unknown>, message: string): void
  warn(payload: Record<string, unknown>, message: string): void
  info(payload: Record<string, unknown>, message: string): void
  debug(payload: Record<string, unknown>, message: string): void
}

export function createBrowserLogger(appName: string): BrowserLogger {
  const prefix = `[${appName}]`

  function log(level: BrowserLogLevel, payload: Record<string, unknown>, message: string) {
    const timestamp = new Date().toISOString()
    const entry = { timestamp, app: appName, level, ...payload, message }

    if (level === 'error') {
      console.groupCollapsed(`${prefix} ${message}`)
      console.error(entry)
      console.groupEnd()
    } else if (level === 'warn') {
      console.groupCollapsed(`${prefix} ${message}`)
      console.warn(entry)
      console.groupEnd()
    } else if (level === 'info') {
      console.info(`${prefix}`, entry)
    } else {
      console.debug(`${prefix}`, entry)
    }
  }

  return {
    error(payload: Record<string, unknown>, message: string) { log('error', payload, message) },
    warn(payload: Record<string, unknown>, message: string) { log('warn', payload, message) },
    info(payload: Record<string, unknown>, message: string) { log('info', payload, message) },
    debug(payload: Record<string, unknown>, message: string) { log('debug', payload, message) },
  }
}