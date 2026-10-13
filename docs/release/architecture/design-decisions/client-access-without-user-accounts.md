# Client access without user accounts

## Decision
Applications outside Whoobe (a back-end, a mobile app, a web app) use the platform through **API clients** at `/client/v1`. Whoobe creates **no end
users** for them. A client proves who it is in one of two ways:

- **A server key**, static, held by a **server** only (a back-end, a job, an automation engine); or
- **The access token of your identity provider** (Keycloak, Entra ID, Cognito, Auth0...), validated by Whoobe, for **browsers and apps**.

A key is **refused when it arrives from a browser**; there is no "public key" kind. What each client may call is an explicit list of scopes
(deny by default), and signed-in users can be narrowed further by rules on the token's claims (roles, groups).

## Why
- **Whoobe is not an identity system.** The organisation already has one. Duplicating users, passwords, MFA and lifecycle in Whoobe would create a
  second identity to govern and a second place a leaver is forgotten.
- **No secret in a place anyone can read.** A key inside a web page or an app is a key published to the world. For those clients the credential is a
  token that the identity provider issues, signs and expires; Whoobe checks the signature and holds nothing worth stealing.
- **Least privilege that is readable.** A scope is one line (`data:read:Blog`, `gateway:call:Shop:GET:orders.json`, `automation:run:n8n:webhook/signup`).
  A refusal about *what exists* is always the same `404`, so a client cannot learn what else is there.
- **Operations that match.** Per-client and per-user limits, a daily quota, address lists, suspension and key rotation, with shared counters in
  Valkey when needed.

## What it costs
- **A token that is stolen and still valid works until it expires.** There is no introspection or revocation check; keep token lifetimes short at the
  provider, and suspend the client in an emergency.
- **Opaque (non-JWT) access tokens are not supported**; tokens must be signed JWTs.
- **Key clients are as safe as the server that holds them.** The address list is the real control for a key, because a script can leave the browser's
  `Origin` header out.
- **Tested against Keycloak only.** Entra ID, Cognito and Auth0 are documented but not yet exercised.

## When to revisit
When token revocation (introspection) is needed, or when Whoobe-issued short-lived tokens are wanted for clients without an identity provider
(optional phase 6 of the plan).

## Where it shows in the product
[API clients guide](../../communication/api-clients.md); the plan [`client-access-hub.md`](../../../plans/api-gateway/client-access-hub.md) (sections 11 to 14
record the decisions and their order).
