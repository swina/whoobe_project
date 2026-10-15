// Public sandbox mode (docs/release/operations/sandbox.md). One place reads the environment, so the services agree:
//   SANDBOX_MODE=1            switches the restrictions on
//   SANDBOX_RESET_AT          ISO time of the next scheduled reset (written by scripts/sandbox/reset.sh; shown in the UI)
//   ASSET_MAX_FILE_BYTES      per-file upload cap (also usable outside the sandbox; default 50 MB)
//   ASSET_MAX_COUNT           maximum number of assets (unset = unlimited)
//   SANDBOX_ALLOW_HOSTS       comma-separated host names safeFetch may still call in the sandbox (exact match, e.g.
//                             dummyjson.com for the API Gateway demo); unset = no outbound HTTP at all
const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;

export function isSandbox(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SANDBOX_MODE === '1' || env.SANDBOX_MODE === 'true';
}

function positiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function assetMaxFileBytes(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.ASSET_MAX_FILE_BYTES) ?? DEFAULT_MAX_FILE_BYTES;
}

export function assetMaxCount(env: NodeJS.ProcessEnv = process.env): number | null {
  return positiveInt(env.ASSET_MAX_COUNT);
}

export interface SandboxStatus {
  resetAt: string | null;
  maxFileBytes: number;
  maxAssets: number | null;
  /** The shared demo account, shown in the banner. PUBLIC by design: only set it for an account everyone may use. */
  demo: { email: string; password: string } | null;
}

export function sandboxStatus(env: NodeJS.ProcessEnv = process.env): SandboxStatus | null {
  if (!isSandbox(env)) return null;
  const email = env.SANDBOX_DEMO_EMAIL?.trim();
  const password = env.SANDBOX_DEMO_PASSWORD;
  return {
    resetAt: env.SANDBOX_RESET_AT || null,
    maxFileBytes: assetMaxFileBytes(env),
    maxAssets: assetMaxCount(env),
    demo: email && password ? { email, password } : null,
  };
}

export const SANDBOX_DISABLED_MESSAGE = 'This feature is disabled in the public sandbox';

// Features that reach outside the stack or run builds: refused in the sandbox (path prefixes of core-api).
const BLOCKED_PREFIXES = [
  '/publish/', '/ai/', '/mail-settings', '/mail-templates', '/mail-log', '/figma/', '/migration-sources',
  '/whoobe-one/settings/cdn-mirror', '/public/dam/assets/mirror-status',
];
const BLOCKED_PATTERNS = [
  /^\/whoobe-one\/websites\/[^/]+\/generate-pwa$/,
  /^\/whoobe-one\/websites\/[^/]+\/gateway-api-key\/regenerate$/,
];

export function isSandboxBlockedPath(path: string): boolean {
  return BLOCKED_PREFIXES.some((p) => path.startsWith(p)) ||
    BLOCKED_PATTERNS.some((r) => r.test(path));
}

/** Thrown where code would reach an external service. */
export class SandboxDisabledError extends Error {
  constructor() { super(SANDBOX_DISABLED_MESSAGE); this.name = 'SandboxDisabledError'; }
}

export const SANDBOX_READ_ONLY_MESSAGE = 'This is read-only in the public sandbox';

// The shared demo account may look at users and roles but not change them (nor its own sign-in security: a changed
// password or a new MFA device would lock every other visitor out until the next reset).
const READ_ONLY_PREFIXES = ['/auth/users', '/auth/roles', '/auth/mfa/setup', '/auth/mfa/verify-setup', '/auth/mfa/disable'];

export function isSandboxReadOnlyPath(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  return READ_ONLY_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function sandboxAllowedHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.SANDBOX_ALLOW_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

/** Exact host-name match (no wildcards, no sub-domains, never an IP address unless it is listed verbatim). */
export function isSandboxHostAllowed(hostname: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return sandboxAllowedHosts(env).includes(hostname.replace(/^\[|\]$/g, '').toLowerCase());
}
