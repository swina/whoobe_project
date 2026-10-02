# Security checklist - manual tests on the throwaway stack

Companion to `security-testing-plan.md` and `findings.md`. The automatic suite (`pnpm security:api`) already covers
most of this at API level; these are the checks that need a browser or a human eye. Tick each box, note the result.

- Tester: ______________   Date: ______________   Commit: ______________
- Result legend: **OK** = as expected, **KO** = differs (write what you saw), **n/a** = could not run.

## 0. Setup

| | Step |
|---|---|
| [ ] | `scripts/security/stack.sh up` (all services `healthy`: `docker compose -p whoobe-sectest ps`) |
| [ ] | `pnpm security:api` is green (936+ tests) before you start |
| [ ] | Browser: **private/incognito window**, nothing else open on `localhost` (the session cookie is shared with the dev stack: same host, any port) |
| [ ] | Admin: `http://localhost:3100` - login `admin@sectest.local`, password = `SEED_ADMIN_PASSWORD` in `scripts/security/.env.sectest` |
| [ ] | Other ports: core-api `3103`, asset-processor `3102`, gateway `3101`, editor `3106` (`/whoobe-one/`), MinIO console `9101` |

Menu names below are indicative; use the nearest equivalent if the label differs.

## 1. Cross-site scripting

| # | Finding | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 1.1 | F-010 | Create a Data Class (or page) titled `zz <img src=x onerror=alert(1)> zz`. Run Admin search for `zz`. | The title is shown as **text** (angle brackets visible). No alert. | | |
| 1.2 | F-010 | Same title on a snippet; open the editor's own search (`/whoobe-one/` search view) | Text, no alert | | |
| 1.3 | F-022 | Assets: upload `x.html` containing `<script>alert(document.domain)</script>`. Open its URL (`localhost:3102/dam-asset/...`) in a new tab. | The browser **downloads** the file (no page rendered, no alert) | | |
| 1.4 | F-022 | Upload `x.svg` = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>`; open it directly. | Image shown (or blank), **no alert**. DevTools > Network: response has `Content-Security-Policy: ... sandbox` | | |
| 1.5 | F-022 | Use that SVG as an image in a page | Renders as an image, no alert | | |
| 1.6 | F-008 (open) | In a page block of type text/typography enter `<img src=x onerror=alert(1)>`; view it in the editor and in Preview | **Known open item**: rich text is rendered as HTML by design. Note what happens (alert yes/no) and who can author it. | | |

## 2. Access to files and assets

| # | Finding | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 2.1 | F-024 | Upload an asset to a folder that is **not** public (e.g. `/docs/secret.png`). Copy its `dam-asset` URL. Open it in a window **without login** (another private window). | **404** | | |
| 2.2 | F-024 | Open the same URL in the logged-in window | Image shown | | |
| 2.3 | F-024 | Upload to a public folder (default rule `/public/**`) and open without login | Image shown (200) | | |
| 2.4 | F-024 | Without login open `localhost:3102/dam-asset/private/anything.txt` | 404 | | |
| 2.5 | F-023 | Without login: `curl -s -o /dev/null -w "%{http_code}\n" -F file=@any.png http://localhost:3102/api/v1/process` | **401** | | |
| 2.6 | F-025 | Logged in, upload a file whose name contains `..` (e.g. `../x.png`) | Rejected (4xx) or stored without escaping its folder; never a server error page | | |

## 3. Browser-to-API trust (CORS and cookies)

| # | Finding | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 3.1 | F-011 | Logged in on the admin. In a **different tab** open `https://example.com`, DevTools console: `fetch('http://localhost:3103/auth/me',{credentials:'include'}).then(r=>r.text()).then(console.log)` | Fails with a CORS error; the response body is **not** readable | | |
| 3.2 | F-011 | Same fetch **without** `credentials` against `http://localhost:3103/public/websites` | Works (public data, readable from any origin) | | |
| 3.3 | F-012 | DevTools > Application > Cookies > `wcms_session` | HttpOnly checked, SameSite = Lax, Path `/`. (`Secure` appears only over HTTPS: expected unchecked here.) | | |
| 3.4 | F-014 | `curl -sI http://localhost:3103/health` | `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy` present; **no** `X-Powered-By` | | |
| 3.5 | - | Admin dashboard still works end to end: login, list pages, upload an asset, open the editor, save a thumbnail | All OK (this guards against the CORS allowlist breaking the app) | | |

## 4. Accounts and sessions

| # | Finding | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 4.1 | F-016 | Create user `tmp1@sectest.local`. From a terminal send 5 wrong logins for it: `for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} " -X POST localhost:3103/auth/login -H 'content-type: application/json' -d '{"email":"tmp1@sectest.local","password":"bad"}'; done` then a 6th with the right password | 401 x5, then the right password from the **same machine** gives **429** | | |
| 4.2 | F-016 | Same, but add `-H 'X-Forwarded-For: 203.0.113.9'` to the correct login (stack runs `TRUST_PROXY=1`) | **200**: a different client address is not locked out | | |
| 4.3 | F-013 | Log in as `tmp1` in window A. In window B (admin) Users > `tmp1` > **Reset password**, copy the link/token, open `localhost:3100/reset-password?token=...`, set a new password. Reload window A. | Window A is logged out (401 / back at login) | | |
| 4.4 | F-021 | Reuse the same reset link | Rejected (invalid/expired) | | |
| 4.5 | F-015 | `docker compose -p whoobe-sectest logs core-api \| grep -iE "reset|login failed"` after the steps above | No reset token/URL, no e-mail, no hash prefix in any line | | |
| 4.6 | - | Log out, press Back | You are not shown protected data; a reload asks for login | | |

## 5. Gateway and outbound requests

| # | Finding | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 5.1 | F-026 | Gateway: new endpoint, base URL `http://127.0.0.1:3003`, route `GET /health`. **Test route**. | Fails; no `core-api` health body shown | | |
| 5.2 | F-026 | Same with `http://169.254.169.254` and with `http://localhost:3003` | Fails | | |
| 5.3 | F-026 | Same with `http://core-api:3003` | Works (private network allowed by default) and shows the health JSON | | |
| 5.4 | F-026 | In `scripts/security/.env.sectest` add `OUTBOUND_ALLOW_PRIVATE=false`, `stack.sh up`, repeat 5.3 | Now **fails**. Remove the line again afterwards. | | |
| 5.5 | F-027 | Import OpenAPI with Spec URL `http://169.254.169.254/` | Refused | | |
| 5.6 | F-027 | Import OpenAPI with pasted JSON containing a schema `{"$ref":"file:///etc/passwd"}` | No file content in the result | | |
| 5.7 | - | Import a normal small spec (JSON, no external refs) | Routes created | | |

## 6. Things to look for while clicking around

- [ ] Any 500 page, or an error toast containing SQL text (`Failed query`, `select ... from`) - should now read "Internal server error"
- [ ] Any screen that shows a token, API key, password hash or full reset link
- [ ] Features that stopped working after the security changes (note exactly which and what the Network tab shows: status, `access-control-*` headers, response body)

## 7. Not testable here (open items)

- F-001 rebuild Oracle with fresh secrets; also rebuild images built before F-020 (they contain `.env.*` and host logs).
- F-024 is enforced here because `DAM_ENFORCE_ASSET_VISIBILITY=true`; decide before enabling it in production.
- SPA Content-Security-Policy, sharp pixel limit, MFA brute-force limits, public search/AI rate limits (plan 3.15), gateway site-auth (3.9).

## 8. Clean up

`scripts/security/stack.sh down` (also deletes the test database and MinIO volume).

## Sign-off

KO items: ____________________   Follow-up findings to open: ____________________
