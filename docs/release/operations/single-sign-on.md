# Single sign-on for staff (OpenID Connect)

Staff sign in to the dashboard with the organisation's identity provider instead of (or next to) a Whoobe password. One provider per
installation; the standard OpenID Connect *authorization code* flow with PKCE. SAML and LDAP are not built: put a broker such as Keycloak in
front of them. How it works and what it guarantees: [authentication and authorization, section 4b](../architecture/authentication-and-authorization.md).

## 1. What you need from the provider

| Item | Value |
|---|---|
| Application type | a *web application* with the **authorization code** flow (a confidential client with a secret, or a public client: Whoobe uses PKCE either way) |
| Redirect URI | `<address core-api answers on>/auth/oidc/callback`, for example `https://dashboard.example.com/auth/oidc/callback`. Exact match; the settings screen shows it as you type |
| Scopes | `openid email profile` (the defaults) |
| Claims in the **ID token** | `sub`, `email`, `email_verified`, `name`; and the groups or roles you want to map, in one claim |
| Issuer address | the issuer exactly as the provider writes it (Keycloak: `https://host/realms/<realm>`; Entra: `https://login.microsoftonline.com/<tenant>/v2.0`; Okta: `https://<org>.okta.com`; Google: `https://accounts.google.com`). `<issuer>/.well-known/openid-configuration` must answer and its `issuer` must be identical |

Take the **client ID** and, if the provider issued one, the **client secret**.

## 2. Settings in the dashboard

Settings > Security > *Single sign-on* (permission `settings:manage`; the change is in the [audit log](audit-log.md)).

1. Issuer address, client ID, client secret (stored encrypted with `INTEGRATION_SECRETS_ENCRYPTION_KEY`; it is never shown again, only "set").
2. *Address the provider calls back*: the public address of core-api. Behind the standard nginx this is the dashboard's address; the redirect URI shown below the field is what you register at the provider.
3. *Address of the dashboard*: where people land. Leave blank when it is the same address (production behind one proxy). In development the dashboard (port 3000) and core-api (port 3003) differ: set the first to the dashboard and the second to core-api.
4. **Test the saved address**: reads the discovery document and says what it found.
5. Roles (section 3), then switch it on and save. The sign-in screen then shows *Sign in with ...* under the password form.

Keep a local administrator account that you have tried: it is the way in when the provider is down, and the settings screen itself needs a session.

## 3. Roles from the provider

Give the claim that holds the groups or roles (`groups`, `roles`, Keycloak realm roles `realm_access.roles`, Entra `roles` or `groups`), then one line per value:
*value in the claim -> Whoobe role*.

- At **every** sign-in the roles listed in the mapping follow the claim: granted when the value is there, taken away when it is not. So removing someone from a group at the provider takes the role away at their next sign-in.
- Roles you give by hand in Users and roles, and that are not in the mapping, are never touched.
- A person who would end up with **no role** is refused with "No access has been given to this account" (and an account is not even created for a new one). Tick default roles under *Who may sign in* to give a new person something when no value matches.
- Entra sends group **object ids** and only up to a limit (then an "overage" link instead): prefer *app roles* (`roles` claim) there.

## 4. Who may sign in

| Setting | Effect |
|---|---|
| Create an account for a person the provider knows | off (default): only people who already have an account, or whose e-mail matches one, can sign in. On: a new account is created at the first sign-in, with a password nobody knows |
| Link to an existing account with the same e-mail | on (default): the first sign-in links the identity to the account **if the provider says the e-mail is verified**. Off: never link; such a person is refused. An unverified e-mail never links or creates |
| The password form | *works for everybody* (default), or *only for users who can manage users* (the break-glass). There is no "none": a provider outage must not lock everyone out |

Linking by e-mail trusts the provider's statement that it verified the address. If your provider lets people choose an unverified or self-asserted address, turn linking off.

## 5. Deprovisioning: what happens when someone leaves

- A person disabled or deleted at the provider **cannot start a new session**: the provider will not authenticate them. (Tried against Keycloak: the browser stays on the provider's page with an error and Whoobe is never called.)
- A session already open **keeps working** until it ends (up to 7 days) - there is no single logout or back-channel logout. To end it now, deactivate the user in Users and roles: a deactivated user's sessions stop at once and they are refused at the callback.
- Taking the person out of the mapped groups removes their roles at the **next** sign-in, not before.

## 6. Second factor

The *two-factor authentication required for these roles* setting applies to the **password** form. A person who signs in through the provider uses the provider's
own second factor; Whoobe does not ask a second time. If a role must have a second factor, enforce it at the provider and set the password form to administrators only.

## 7. Variables

| Variable | Default | Meaning |
|---|---|---|
| `OIDC_ALLOW_HTTP` | `false` | accept an `http://` provider address in production (a provider on a network you trust). Outside production http is always accepted |
| `OIDC_START_RATE_LIMIT_PER_MINUTE` | `30` | sign-in starts per client address per minute; `0` = off |
| `OUTBOUND_ALLOW_PRIVATE`, `OUTBOUND_ALLOW_LOOPBACK`, `OUTBOUND_ALLOW_HOSTS` | see the [configuration reference](configuration-reference.md) | the outbound guard applies to every request to the provider: a provider on a private address needs private addresses allowed (the default) |

## 8. When it does not work

The browser lands on the sign-in screen with a message; the cause is in the core-api log (`OIDC sign-in refused (<code>): ...`).

| Message | Usual cause |
|---|---|
| The sign-in expired or was not started here | the page was open more than 10 minutes, cookies are blocked, the callback address differs from the one the sign-in started on (the `wcms_oidc` cookie is per address), or core-api restarted in between (the sign-in in progress is in memory) |
| The provider's answer could not be verified | wrong issuer (a trailing slash counts), the client ID is not in the token's audience, clock skew over a minute, a signing algorithm that is not an asymmetric one |
| The provider did not complete the sign-in | wrong client secret, redirect URI not registered exactly, the provider cannot be reached from core-api (outbound guard) |
| The provider has not verified your e-mail address | `email_verified` is false or absent: enable e-mail verification or add the claim |
| There is no account for you here | provisioning is off, or linking is off and the e-mail already has an account |
| No access has been given to this account | no mapped group matches and there is no default role |

## 9. Tested against

A mock provider that signs real RS256 tokens and forges them nine ways (`scripts/security/api/oidc-login.test.ts`), and **Keycloak 26** (`scripts/security/keycloak/run.sh up`, then
`KEYCLOAK_ISSUER=... npx playwright test browser/oidc-keycloak.spec.ts`): discovery, code + PKCE with a client secret, group mapper to roles, a group removed, a person disabled.
Microsoft Entra, Okta and Google follow the same standard and have **not** been tried here; if one does not work, the log line above says why.
