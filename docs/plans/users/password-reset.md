# PASSWORD RESET

The password reset flow allows users to regain access to their account when they forget their password.

## FLOW OVERVIEW

- forgot password (email input) > email (reset link) > reset password (new password) > login

## FORGOT PASSWORD

An unauthenticated user requests a password reset by providing their email.

**Rules:**
- Only active users receive a reset email — no account existence disclosure
- Rate-limited to 3 requests per email per 15 minutes
- Always responds with `{ success: true }` to prevent email enumeration

**What happens:**
1. A random 32-byte hex token is generated and stored on the user record
2. An expiration timestamp (1 hour) is set alongside the token
3. An email is sent containing a link: `http://<host>:3000/reset-password?token=<token>`
4. If no SMTP is configured, the reset URL is logged to the server console

## RESET PASSWORD

The user clicks the link from the email and submits a new password.

**Rules:**
- New password must be at least 8 characters
- Token must match the stored value and not be expired (1 hour TTL)
- Token is consumed after use (single-use)
- Password is hashed with argon2id before storage

**What happens:**
1. Token is looked up in the users table
2. Expiry is checked server-side against `reset_token_expires_at`
3. Password is hashed and updated
4. Token and expiry are cleared from the user record

## RATE LIMITING

Same single-process in-memory approach as the login lockout guard (see `apps/core-api/src/server.ts`).

- `POST /auth/forgot-password`: 3 requests per email per 15 minutes
- `POST /auth/reset-password`: no rate limit (token is the gate)

## ENDPOINTS

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/forgot-password` | No | Sends reset email if account exists |
| `POST` | `/auth/reset-password` | No | Updates password with valid token |

## DEPENDENCIES

- SMTP configuration stored in `mail_settings` DB table (configured via admin UI)
- `reset_token` and `reset_token_expires_at` columns on the `users` table
- Argon2 password hashing (same as login)
- `packages/core/src/auth/reset-password.ts` service
- `apps/admin-dashboard/src/views/ForgotPasswordView.vue`
- `apps/admin-dashboard/src/views/ResetPasswordView.vue`