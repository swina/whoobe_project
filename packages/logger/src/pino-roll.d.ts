declare module 'pino-roll' {
  import { EventEmitter } from 'node:events'

  interface RollOptions {
    file: string
    frequency?: string | number
    size?: string | number
    maxFiles?: number
    maxSize?: string | number
    mkdir?: boolean
    dateFormat?: string
    symlink?: boolean
  }

  interface RollStream extends EventEmitter {
    write(data: string | Buffer): boolean
    end(): void
    destroy(): void
    flush(): Promise<void>
  }

  function roll(options: RollOptions): Promise<RollStream>

  export { RollOptions, RollStream }
  export default roll
}