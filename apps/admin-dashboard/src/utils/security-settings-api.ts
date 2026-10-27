import { getDefaultCoreApiUrl } from './auth-api'

// Who must use a second factor and the minimum a new password must satisfy (docs/plans/system/mandatory-2fa-plan.md).

export interface PasswordPolicy {
  minLength: number
  /** at least three of: lowercase, uppercase, digit, symbol */
  requireClasses: boolean
}

export interface SecuritySettings {
  /** users with one of these roles must enrol a second factor at their next sign-in */
  requireMfaRoleIds: string[]
  passwordPolicy: PasswordPolicy
  /** days after which a row of the mail log is deleted; null = keep */
  mailLogRetentionDays: number | null
  /** token usage of the AI functions recorded per user; off by default */
  aiUsageTracking: boolean
  /** days after which a row of the AI usage is deleted (the monthly totals stay); null = keep */
  aiUsageRetentionDays: number | null
  /** days after which a recorded AI generation (prompt and answer) is deleted; null = keep */
  aiGeneratedRetentionDays: number | null
  updatedAt: string | null
  /** every role, for the picker (a settings manager may not be allowed to list roles) */
  roles?: { id: string; name: string }[]
}

export interface SecuritySettingsInput {
  requireMfaRoleIds?: string[]
  passwordMinLength?: number
  passwordRequireClasses?: boolean
  mailLogRetentionDays?: number | null
  aiUsageTracking?: boolean
  aiUsageRetentionDays?: number | null
  aiGeneratedRetentionDays?: number | null
}

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || getDefaultCoreApiUrl()).replace(/\/+$/, '')
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // Ignore body parse failures; use the generic message above.
    }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchSecuritySettings(baseUrl: string): Promise<SecuritySettings> {
  return parseJsonOrThrow(await fetch(`${normalizeBaseUrl(baseUrl)}/security-settings`, { credentials: 'include' }))
}

export async function saveSecuritySettings(baseUrl: string, input: SecuritySettingsInput): Promise<SecuritySettings> {
  return parseJsonOrThrow(await fetch(`${normalizeBaseUrl(baseUrl)}/security-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  }))
}
