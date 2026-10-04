// Two disposable stacks that stand for two workspaces on the same host: A = .env.sectest, B = .env.sectest-b
// (scripts/security/stack.sh up ; SEC_STACK=b scripts/security/stack.sh up). Same safety rules as the rest of the suite.
import { resolve } from 'node:path'
import { readEnvFile, SECURITY_DIR } from '../lib/config'
import { Client } from '../lib/client'

export interface Stack {
  name: 'A' | 'B'
  project: string
  env: Record<string, string>
  core: string
  gateway: string
  asset: string
  admin(): Promise<Client>
}

function stack(name: 'A' | 'B', file: string, project: string): Stack {
  const env = readEnvFile(resolve(SECURITY_DIR, file))
  if (!(env.DB_NAME ?? '').includes('_sec_test')) throw new Error(`${file}: DB_NAME must contain "_sec_test"`)
  const base = (port: string) => `http://localhost:${port}`
  const s: Stack = {
    name, project, env,
    core: base(env.WS_CORE_API_PORT),
    gateway: base(env.WS_GATEWAY_PORT),
    asset: base(env.WS_ASSET_PROCESSOR_PORT),
    async admin() {
      const c = new Client(s.core, `admin-${name}`)
      await c.login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD)
      return c
    },
  }
  return s
}

export const A = () => stack('A', '.env.sectest', 'whoobe-sectest')
export const B = () => stack('B', '.env.sectest-b', 'whoobe-sectest-b')
