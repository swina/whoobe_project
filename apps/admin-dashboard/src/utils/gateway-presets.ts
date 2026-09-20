import type { GatewayEndpoint } from './gateway-api'

export interface GatewayPreset {
  id: string
  label: string
  description: string
  baseUrl: string
  authType: GatewayEndpoint['authType']
  /** Field names the form should show for this auth type - values are left
   *  blank for the user to fill in, this only pre-selects which fields
   *  matter (e.g. a Shopify preset doesn't need a Token URL / Scope). */
  authConfigFields: string[]
  /** Pre-filled values for some of authConfigFields - only for values that
   *  are the same for every installation of this vendor (an exact header
   *  name the vendor's docs mandate), never a secret. Brevo's `api-key`
   *  header name is easy to get wrong (case/spelling) and silently break
   *  every request, so it's worth pre-filling; a per-account secret like
   *  `keyValue` never belongs here. */
  defaultAuthConfig?: Record<string, string>
  starterRoutes: { method: string; path: string; description: string }[]
}

// Exactly the 4 vendors named in the roadmap's Phase 1 (Shopify, Stripe,
// HubSpot, Brevo) - a small hardcoded list, not a registry/marketplace
// (that's explicitly Phase 3 of the roadmap, out of scope here).
export const GATEWAY_PRESETS: GatewayPreset[] = [
  {
    id: 'shopify',
    label: 'Shopify',
    description: 'Admin API for a Shopify store (private/custom app access token).',
    baseUrl: 'https://{shop}.myshopify.com/admin/api/2024-10',
    authType: 'api-key',
    authConfigFields: ['keyHeader', 'keyValue'],
    starterRoutes: [
      { method: 'GET', path: 'products.json', description: 'List products' },
      { method: 'GET', path: 'orders.json', description: 'List orders' },
    ],
  },
  {
    id: 'stripe',
    label: 'Stripe',
    description: 'Payments API using a secret key as a bearer token.',
    baseUrl: 'https://api.stripe.com',
    authType: 'bearer',
    authConfigFields: ['token'],
    starterRoutes: [
      { method: 'GET', path: 'v1/customers', description: 'List customers' },
      { method: 'GET', path: 'v1/charges', description: 'List charges' },
    ],
  },
  {
    id: 'hubspot',
    label: 'HubSpot',
    description: 'CRM API using a private app access token.',
    baseUrl: 'https://api.hubapi.com',
    authType: 'bearer',
    authConfigFields: ['token'],
    starterRoutes: [
      { method: 'GET', path: 'crm/v3/objects/contacts', description: 'List contacts' },
      { method: 'POST', path: 'crm/v3/objects/contacts', description: 'Create a contact' },
    ],
  },
  {
    id: 'brevo',
    label: 'Brevo',
    description: 'Marketing/transactional email & contacts API.',
    baseUrl: 'https://api.brevo.com/v3',
    authType: 'api-key',
    authConfigFields: ['keyHeader', 'keyValue'],
    defaultAuthConfig: { keyHeader: 'api-key' },
    starterRoutes: [
      { method: 'GET', path: 'contacts', description: 'List contacts' },
      { method: 'POST', path: 'smtp/email', description: 'Send a transactional email' },
      // Campaign endpoints (Whoobe → Brevo campaign integration).
      // BrevoCampaignModal.vue POSTs a rendered mail template's HTML to
      // 'emailCampaigns' to create a draft, and reads 'contacts/lists' to
      // populate its recipient-list picker (Phase 2); the get/send routes
      // are added now so they're one click away for later phases (checking
      // status, sending) without editing the preset again.
      { method: 'POST', path: 'emailCampaigns', description: 'Create an email campaign (draft)' },
      { method: 'GET', path: 'emailCampaigns', description: 'List email campaigns' },
      { method: 'POST', path: 'emailCampaigns/{campaignId}/sendNow', description: 'Send a campaign immediately' },
      { method: 'GET', path: 'contacts/lists', description: 'List contact lists (campaign recipients)' },
    ],
  },
  {
    id: 'cloudinary',
    label: 'Cloudinary',
    description: 'Image/video CDN - mirrors DAM assets to a public, stable delivery URL (docs/plans/assets/assets-cdn.md).',
    baseUrl: 'https://api.cloudinary.com/v1_1/{cloud_name}',
    // Cloudinary's primary upload API needs a per-request HMAC signature
    // (api_key + timestamp + everything else, signed with api_secret) -
    // not something the Gateway's static-header auth types can produce.
    // This preset instead assumes an *unsigned* upload preset (configured
    // once in Cloudinary's own dashboard, marked "unsigned") - every
    // upload just POSTs `file` + `upload_preset=<name>`, no signature and
    // no secret in the request at all, so `authType: 'none'` is correct
    // here rather than a misleading api-key/bearer field that would go
    // unused.
    authType: 'none',
    authConfigFields: [],
    starterRoutes: [
      { method: 'POST', path: 'image/upload', description: 'Upload/mirror an image (unsigned upload preset)' },
    ],
  },
]
