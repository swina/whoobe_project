# Credentials stay on the server

## Decision
The secrets for third-party services (ERP, CRM, mail, payment, AI) are stored **encrypted on the server** and used only inside Whoobe's
services. The editor's users, the browser, the published site and any application that uses Whoobe never receive them. What people get
instead is a way to **ask Whoobe to make the call**: an Integrations binding, a form, or a Client Hub request.

## Why
- **A secret that reaches a browser is public.** Pages are read by anyone; an API key placed in a page or an app can be copied by anyone.
- **One place to rotate and review.** Changing a CRM key means changing it once, in the endpoint, not in every page, app and script.
- **Editors do not need the secrets.** Binding a field to a CRM list does not require knowing the CRM's key; the people who author content are
  not the people who hold production credentials.
- **Defence in depth around the call.** Because every outbound call goes through the gateway, it can add the controls once for all callers:
  encryption at rest (AES-256-GCM), the SSRF guard (no loopback, metadata or private targets), rate limits, header allow-lists, and a form can
  only forward fields it actually has.

## What it costs
- **The gateway is a critical component.** If it is down or misconfigured, every binding that depends on it stops. It must be monitored and sized.
- **Some authentication cannot be expressed.** Requests that must be signed per call (Cloudinary signed uploads, AWS-style signatures) need a plugin
  or a token-based form of that API.
- **A key to protect the keys.** The encryption keys live in the process environment; losing them makes the stored credentials unreadable, and there
  is no rotation tool yet ([secrets and keys](../../operations/secrets-and-keys.md)).

## When to revisit
When an external secrets manager (Vault, a cloud KMS) is wanted as the store instead of encrypted database fields.

## Where it shows in the product
[Integrations guide](../../communication/integrations.md), [API Gateway security](../../communication/api-gateway-security.md),
[encryption](../../operations/encryption.md), plan [`gateway-auth-authz.md`](../../../plans/api-gateway/gateway-auth-authz.md).
