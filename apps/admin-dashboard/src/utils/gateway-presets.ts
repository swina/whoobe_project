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
    starterRoutes: [
      { method: 'GET', path: 'contacts', description: 'List contacts' },
      { method: 'POST', path: 'smtp/email', description: 'Send a transactional email' },
    ],
  },
]
