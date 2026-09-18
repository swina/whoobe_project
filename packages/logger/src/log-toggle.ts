import type { Logger } from 'pino'

const DEFAULT_POLL_INTERVAL_MS = 30_000

/**
 * Wires a live on/off switch onto an already-created Pino logger. checkEnabled
 * is polled on an interval; when it resolves false the logger is muted via
 * logger.level = 'silent' (Pino's own off switch - nothing is written to any
 * stream), and restored to its original level once checkEnabled resolves true
 * again. A failed check is logged once and otherwise ignored - the logger
 * keeps whatever state it was last known to have rather than flapping.
 *
 * Returns a stop() function that clears the poller (mainly for tests).
 */
export function attachLoggingToggle(
  logger: Logger,
  checkEnabled: () => Promise<boolean>,
  options: { pollIntervalMs?: number } = {}
): () => void {
  const baseLevel = logger.level
  let warned = false

  async function poll() {
    try {
      const enabled = await checkEnabled()
      logger.level = enabled ? baseLevel : 'silent'
    } catch (err) {
      if (!warned) {
        warned = true
        console.error('[logger] Failed to check logging-enabled setting, leaving logger as-is:', err)
      }
    }
  }

  void poll()
  const timer = setInterval(poll, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)
  timer.unref?.()

  return () => clearInterval(timer)
}
