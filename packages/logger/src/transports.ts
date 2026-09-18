import { mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import pino from 'pino'
import roll, { type RollStream } from 'pino-roll'
import type { LoggerConfig, LogLevel } from './types.js'
import { uploadRotatedLog } from './dam-upload.js'

const LOG_DIR = resolve(process.env.LOG_DIR ?? './logs')
const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info'
const NODE_ENV = process.env.NODE_ENV ?? 'development'

let pinoInstance: pino.Logger | null = null
let rotationStream: RollStream | null = null

export async function createRotatingStream(appName: string): Promise<RollStream> {
  const logDir = join(LOG_DIR, appName)
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }

  const stream = await roll({
    file: join(logDir, `${appName}.log`),
    frequency: 'daily',
    size: '10m',
    maxFiles: 7,
    mkdir: true,
  })

  return stream
}

export async function initLogger(appName: string, config: LoggerConfig = {}): Promise<pino.Logger> {
  if (pinoInstance) return pinoInstance

  const level = config.level ?? LOG_LEVEL
  const redact = config.redact ?? [
    'req.headers.authorization',
    'req.headers.cookie',
    'config.apiKey',
    'config.apiSecret',
    'config.password',
    'config.token',
    'headers.authorization',
    'headers.cookie',
  ]

  const streams: pino.StreamEntry[] = []

  if (NODE_ENV === 'development' || config.prettyPrint !== false) {
    const consoleTransport = pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    })
    streams.push({ level, stream: consoleTransport })
  } else {
    streams.push({ level, stream: pino.destination(1) })
  }

  if (config.file !== false) {
    rotationStream = await createRotatingStream(appName)
    streams.push({ level, stream: rotationStream })

    const shouldUpload = config.damUpload !== false
    rotationStream.on('rotate', async (rotatedFile: string) => {
      if (shouldUpload) {
        try {
          await uploadRotatedLog(appName, rotatedFile)
        } catch (err) {
          console.error('[logger] DAM upload on rotate error:', err)
        }
      }
    })
  }

  pinoInstance = pino(
    {
      name: appName,
      level,
      redact,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label }
        },
      },
    },
    pino.multistream(streams)
  )

  return pinoInstance
}

export function getRotationStream() {
  return rotationStream
}