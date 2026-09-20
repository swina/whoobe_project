// Vendor endpoint presets (apps/gateway/presets/*.json, README.md there for
// the full schema) - starter templates for admin-dashboard's "Add Endpoint"
// form, not executable code (contrast with GatewayPlugin in plugin-types.ts,
// which is real server-side code). Kept as a type here (not shared with
// admin-dashboard) since it's plain JSON-shaped data crossing an HTTP
// boundary - the frontend has its own matching interface in gateway-api.ts.
export interface GatewayPreset {
  id: string;
  label: string;
  description: string;
  baseUrl: string;
  authType: 'none' | 'api-key' | 'bearer' | 'basic' | 'oauth2';
  authConfigFields: string[];
  defaultAuthConfig?: Record<string, string>;
  starterRoutes: { method: string; path: string; description: string }[];
}
