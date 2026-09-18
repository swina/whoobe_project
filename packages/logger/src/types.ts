export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface LoggerConfig {
  level?: LogLevel
  prettyPrint?: boolean
  file?: boolean
  damUpload?: boolean
  redact?: string[]
}

export interface LogPayload {
  module?: string
  requestId?: string
  userId?: string
  latency?: number
  [key: string]: unknown
}