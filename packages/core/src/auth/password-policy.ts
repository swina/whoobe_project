export interface PasswordPolicy {
  minLength: number;
  /** at least three of: lowercase, uppercase, digit, symbol */
  requireClasses: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = { minLength: 8, requireClasses: false };
export const PASSWORD_MIN_LENGTH_LIMITS = { min: 8, max: 128 } as const;

const classesOf = (password: string): number =>
  [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;

/** The first rule a new password breaks, as a sentence for the person setting it; null when it passes.
 *  Applied where a password is SET (register, reset, create, change), never to a login: existing passwords are not re-checked. */
export function checkPasswordPolicy(password: string, policy: PasswordPolicy, context: { email?: string } = {}): string | null {
  if (password.length < policy.minLength) return `Password must be at least ${policy.minLength} characters`;
  if (password.length > PASSWORD_MIN_LENGTH_LIMITS.max) return `Password must be at most ${PASSWORD_MIN_LENGTH_LIMITS.max} characters`;
  if (policy.requireClasses && classesOf(password) < 3) {
    return 'Password must contain at least three of: lowercase letters, uppercase letters, digits, symbols';
  }
  const email = context.email?.trim().toLowerCase();
  if (email) {
    const local = email.split('@')[0];
    const lower = password.toLowerCase();
    if (lower === email || (local.length >= 4 && lower === local)) return 'Password must not be the e-mail address';
  }
  return null;
}

/** A user must enrol a second factor when one of their roles is in the required list. */
export function userMustUseMfa(userRoleIds: readonly string[], requiredRoleIds: readonly string[]): boolean {
  if (requiredRoleIds.length === 0) return false;
  const required = new Set(requiredRoleIds);
  return userRoleIds.some((id) => required.has(id));
}
