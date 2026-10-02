// Known, documented findings are encoded as tests that assert the SECURE behaviour but are
// expected to fail today (`it.fails`). The run stays green; when a fix lands the test starts
// "failing" (it passes), which tells you to turn it into a normal `it`.
import { it } from 'vitest'

export function known(finding: string, name: string, fn: () => unknown | Promise<unknown>) {
  return it.fails(`[${finding}] ${name}`, fn as any)
}
