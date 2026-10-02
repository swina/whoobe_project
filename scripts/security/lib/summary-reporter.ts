// vitest reporter: writes a timestamped run report next to the other scan reports
// (scripts/security/reports/<date>/api-<date>_<time>.txt + .json) in addition to the console output.
import { mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import type { File, Reporter, Task, Vitest } from 'vitest'
import { ROOT_DIR, SECURITY_DIR, TARGET, GATEWAY_TARGET, ASSET_TARGET } from './config'

const pad = (n: number) => String(n).padStart(2, '0')
function stamp(d: Date) {
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}` }
}

function git(cmd: string): string {
  try { return execSync(cmd, { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'n/a' }
}

function* leaves(tasks: Task[], path: string[] = []): Generator<{ name: string; state: string; ms: number; error?: string }> {
  for (const t of tasks) {
    if (t.type === 'suite') yield* leaves(t.tasks, [...path, t.name])
    else yield { name: [...path, t.name].join(' > '), state: t.result?.state ?? 'skip', ms: Math.round(t.result?.duration ?? 0), error: t.result?.errors?.[0]?.message }
  }
}

export default class SummaryReporter implements Reporter {
  private startedAt = new Date()
  private ctx?: Vitest

  onInit(ctx: Vitest) { this.ctx = ctx; this.startedAt = new Date() }

  onFinished(files: File[] = []) {
    const end = new Date()
    const { date, time } = stamp(this.startedAt)
    const dir = resolve(SECURITY_DIR, 'reports', date)
    mkdirSync(dir, { recursive: true })
    const base = resolve(dir, `api-${date}_${time}`)

    const perFile = files.map((f) => {
      const tests = [...leaves(f.tasks)]
      return { file: f.name, passed: tests.filter((t) => t.state === 'pass').length, failed: tests.filter((t) => t.state === 'fail').length, skipped: tests.filter((t) => t.state !== 'pass' && t.state !== 'fail').length, tests }
    })
    const total = perFile.reduce((a, f) => ({ passed: a.passed + f.passed, failed: a.failed + f.failed, skipped: a.skipped + f.skipped }), { passed: 0, failed: 0, skipped: 0 })
    const meta = {
      startedAt: this.startedAt.toISOString(),
      finishedAt: end.toISOString(),
      durationMs: end.getTime() - this.startedAt.getTime(),
      commit: git('git rev-parse --short HEAD'),
      dirty: git('git status --porcelain').length > 0,
      targets: { coreApi: TARGET, gateway: GATEWAY_TARGET, assetProcessor: ASSET_TARGET },
      result: total.failed === 0 && total.passed > 0 ? 'PASS' : 'FAIL',
      ...total,
    }

    writeFileSync(`${base}.json`, JSON.stringify({ ...meta, files: perFile }, null, 2))

    const lines = [
      `Security API test run - ${meta.result}`,
      `Started : ${this.startedAt.toLocaleString('it-IT')}   Duration: ${(meta.durationMs / 1000).toFixed(1)} s`,
      `Commit  : ${meta.commit}${meta.dirty ? ' (uncommitted changes)' : ''}`,
      `Targets : core-api ${TARGET} | gateway ${GATEWAY_TARGET} | asset-processor ${ASSET_TARGET}`,
      `Totals  : ${total.passed} passed, ${total.failed} failed, ${total.skipped} skipped`,
      '',
      'Per file',
      ...perFile.map((f) => `  ${f.failed ? 'FAIL' : ' ok '}  ${f.file.replace(/^.*scripts\/security\//, '')}  (${f.passed}/${f.passed + f.failed + f.skipped})`),
    ]
    const failures = perFile.flatMap((f) => f.tests.filter((t) => t.state === 'fail').map((t) => ({ file: f.file, ...t })))
    if (failures.length) {
      lines.push('', 'Failures')
      for (const t of failures) lines.push(`  - ${t.name}`, `      ${(t.error ?? '').split('\n')[0]}`)
    }
    writeFileSync(`${base}.txt`, lines.join('\n') + '\n')
    this.ctx?.logger?.log?.(`\nReport written: ${base}.txt (+ .json)`)
  }
}
