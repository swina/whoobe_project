export interface GatewayBinding {
  endpointName: string
  routePath: string
  fieldPath: string
  params?: Record<string, string> | null
}