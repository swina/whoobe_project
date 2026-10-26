// The Security section's submenu (sidebar and view share this list): what each entry is called, the icon, and the permission that shows it.
import { Users, Fingerprint, ListChecks, LogIn, UserSearch, Gauge, ScrollText, ShieldCheck } from '@lucide/vue'
import type { SecuritySubSection } from '../stores/tabsStore'

export interface SecurityNavItem {
  key: SecuritySubSection
  name: string
  icon: any
  title: string
  description: string
  /** a permission key; null = every signed-in user (two-factor authentication is a personal setting) */
  permission: string | null
}

export const SECURITY_NAV: SecurityNavItem[] = [
  { key: 'access', name: 'Roles/Users/Workspaces', icon: Users, title: 'Roles / Users / Workspaces', description: 'Manage who can access this dashboard and what they can do.', permission: 'users:manage' },
  { key: 'two-factor', name: 'Two-Factor Authentication', icon: Fingerprint, title: 'Two-Factor Authentication', description: 'A code from an authenticator app in addition to your password.', permission: null },
  { key: 'sign-in', name: 'Sign-in Requirements', icon: ListChecks, title: 'Sign-in Requirements', description: 'Which roles must use two-factor authentication, and the minimum a new password must satisfy.', permission: 'settings:manage' },
  { key: 'sso', name: 'SSO', icon: LogIn, title: 'Single Sign-On', description: 'Let staff sign in with your identity provider (OpenID Connect).', permission: 'settings:manage' },
  { key: 'data-subject', name: 'Data Subject Requests', icon: UserSearch, title: 'Data Subject Requests', description: 'Find, export or erase what is held about one person; keep data no longer than you decide.', permission: 'data_subject:manage' },
  // everyone sees what is recorded about them; the report of every user needs ai_usage:read, the switch settings:manage
  { key: 'ai-usage', name: 'AI Usage', icon: Gauge, title: 'AI Usage', description: 'Tokens used by the AI functions, per person. Counts only, never prompts or answers.', permission: null },
  { key: 'system-logs', name: 'System Logs', icon: ScrollText, title: 'System Logs', description: 'View and search logs by application.', permission: null },
  { key: 'audit-log', name: 'Audit Logs', icon: ShieldCheck, title: 'Audit Logs', description: 'Who changed what, and when.', permission: 'audit:read' },
]

/** The entries a user may open. */
export const visibleSecurityNav = (can: (permission: string) => boolean): SecurityNavItem[] =>
  SECURITY_NAV.filter((i) => i.permission === null || can(i.permission))

export const securityNavItem = (key: SecuritySubSection | undefined): SecurityNavItem | undefined => SECURITY_NAV.find((i) => i.key === key)
