# Mandatory 2FA and a password policy

Release 0.2, block A2 ("Govern"). The plan row: *a setting (`require 2FA for roles X`) and a minimum policy; enrolment is forced at the next login. Done when a user without a second factor is led to enrolment; tests in `mfa.test.ts`.*

## What exists

TOTP with recovery codes is optional per user (`/auth/mfa/setup`, `/verify-setup`, `/disable`, `/challenge`). Login: password, then a pending challenge in memory (`mfaToken`), then the session. The only password rule is `length >= 8` in two places (register, reset). Nothing says which users must have a second factor.

## Decisions

- **Where the setting lives:** one row table `security_settings` (migration 0061, expand only), same shape as the other settings. `GET` / `PUT /security-settings`, permission `settings:manage`, audited. Not environment variables: an administrator must be able to change it without a restart, and the audit log must show who did.
- **Which users:** `require_mfa_role_ids` (uuid array). A user with any of these roles must have a second factor. Empty = nobody (the default, so an upgrade changes nothing).
- **Enforcement point:** the login, not the session. A user who must enrol and has no factor gets **no session**: `/auth/login` answers `{ mfaEnrolmentRequired: true, enrolToken }`, a pending token of the same kind as `mfaToken` (in memory, 10 minutes, kept out of the session table). `POST /auth/mfa/enrol/setup` and `/enrol/verify` take that token instead of a cookie; `/enrol/verify` enables TOTP, returns the recovery codes **and** opens the session. A session with half the rights was rejected: every guard would have to know about it.
- **Sessions already open** when the setting is switched on keep working until they end or the user logs in again ("enrolment is forced at the next login", as the plan says). The setting's page says so. Revoking sessions of the affected users is offered as a button, not done silently.
- **Disabling MFA** (`/auth/mfa/disable`) is refused for a user whose roles require it (409), otherwise the rule is one click from undone.
- **Break-glass:** `reset-user-password.ts` stays; a new option there clears a user's second factor from the server's shell (the lost-phone case when the recovery codes are lost too). Not exposed in the API.
- **Password policy:** `password_min_length` (default 8 = today, 8 to 128), `password_require_classes` (off by default; on = at least three of lowercase, uppercase, digit, symbol), and always: not equal to the e-mail or its local part. Applied where a password is *set* (register, reset, admin create, change); never to a login. Existing passwords are not re-checked. The same function is used by every route.

## Steps

1. Migration 0061, schema, records (`getSecuritySettings` with defaults, `updateSecuritySettings`), pure helpers (`checkPasswordPolicy`, `userMustEnrol`), unit and integration tests.
2. Password policy applied in the routes that set a password; the error names the broken rule.
3. Login branch, enrolment endpoints, `disable` refusal; `GET` / `PUT /security-settings` with audit spec and route contract entries; tests in `scripts/security/api/mfa.test.ts`.
4. Dashboard: enrolment step in `LoginView`, settings screen (roles, policy).
5. Docs (authentication page, configuration, API reference, status summary row), CHANGES.

## Not in this change

Per-user exceptions, WebAuthn, trusted devices, 2FA for API clients (they use keys or JWT).
