# Gateway vendor presets

Each `.json` file here is a starter template for the "Add Endpoint" form in
admin-dashboard's Integrations view (`GatewayEndpointsView.vue`) — pre-fills
`baseUrl`/`authType`/`authConfigFields`/`starterRoutes` for a known vendor so
setting one up doesn't mean hand-typing its API shape from scratch. Loaded at
gateway startup by `../src/preset-loader.ts` and served via
`GET /api/v1/gateway/presets`; the frontend fetches them rather than hardcoding
this data in its own bundle (previously a static array in admin-dashboard's
own `utils/gateway-presets.ts`, moved here so the gateway - not one specific
frontend - is the source of truth, and so adding a vendor is a data change,
not a code change).

This is data only — no code runs from these files. A vendor that also needs
custom request/response logic (not just a template) is a job for a real
plugin (`../plugins/`, `GatewayPlugin`'s `routes`/`requestMiddleware`/
`responseMiddleware` hooks), not this mechanism.

## Schema

```jsonc
{
  "id": "vendor-id",              // unique, used as the file's own basename by convention
  "label": "Vendor Name",
  "description": "One line shown in the preset picker.",
  "baseUrl": "https://api.vendor.com",   // "{placeholder}" segments are left for the user to fill in
  "authType": "none" | "api-key" | "bearer" | "basic" | "oauth2",
  "authConfigFields": ["keyHeader", "keyValue"],  // which auth fields the form should show
  "defaultAuthConfig": { "keyHeader": "api-key" }, // optional - pre-filled values, NEVER a secret
  "starterRoutes": [
    { "method": "GET", "path": "some/endpoint", "description": "What it does" }
  ]
}
```

## Notes worth knowing before editing one of these

- **`brevo.json`**'s `defaultAuthConfig.keyHeader: "api-key"` is Brevo's exact,
  case-sensitive required header name - easy to mistype by hand, which
  silently breaks every request, so it's pre-filled. A per-account secret
  (`keyValue`) must never go in `defaultAuthConfig` - only values that are
  identical for every installation of that vendor belong here.
- **`cloudinary.json`** uses `authType: "none"` deliberately, not `api-key`.
  Cloudinary's primary upload API needs a per-request HMAC signature
  (`api_key` + `timestamp` + everything else, signed with `api_secret`) -
  not something the Gateway's static-header auth types can produce. This
  preset instead assumes an *unsigned* upload preset (configured once in
  Cloudinary's own dashboard, marked "unsigned"): every upload just POSTs
  `file` + `upload_preset=<name>`, no signature and no secret in the request
  at all.
