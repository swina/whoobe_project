import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { listEndpoints, getEndpoint, createEndpoint, updateEndpoint, deleteEndpoint, listRoutes, createRoute, updateRoute, deleteRoute, testRoute, getRouteSchema, refreshSchema, listPlugins, type GatewayEndpoint, type GatewayRoute, type GatewaySchema, type GatewayPluginInfo } from '../utils/gateway-api'

export const useGatewayStore = defineStore('gateway', () => {
  const endpoints = ref<GatewayEndpoint[]>([])
  const currentEndpoint = ref<GatewayEndpoint | null>(null)
  const routes = ref<GatewayRoute[]>([])
  const currentRoute = ref<GatewayRoute | null>(null)
  const currentSchema = ref<GatewaySchema | null>(null)
  const plugins = ref<GatewayPluginInfo[]>([])
  const isLoading = ref(false)
  const errorMessage = ref('')

  const activeEndpoints = computed(() => endpoints.value.filter(e => e.isActive))

  async function refreshEndpoints(): Promise<void> {
    isLoading.value = true
    errorMessage.value = ''
    try {
      endpoints.value = await listEndpoints()
    } catch (e: any) {
      errorMessage.value = e?.message || 'Failed to load endpoints'
    } finally {
      isLoading.value = false
    }
  }

  async function loadEndpoint(id: string): Promise<void> {
    isLoading.value = true
    errorMessage.value = ''
    try {
      currentEndpoint.value = await getEndpoint(id)
    } catch (e: any) {
      errorMessage.value = e?.message || 'Failed to load endpoint'
    } finally {
      isLoading.value = false
    }
  }

  async function createEndpointAndRefresh(input: Partial<GatewayEndpoint>): Promise<GatewayEndpoint> {
    const created = await createEndpoint(input)
    endpoints.value.push(created)
    return created
  }

  async function updateEndpointAndRefresh(id: string, input: Partial<GatewayEndpoint>): Promise<GatewayEndpoint> {
    const updated = await updateEndpoint(id, input)
    const idx = endpoints.value.findIndex(e => e.id === id)
    if (idx >= 0) endpoints.value[idx] = updated
    if (currentEndpoint.value?.id === id) currentEndpoint.value = updated
    return updated
  }

  async function removeEndpoint(id: string): Promise<void> {
    await deleteEndpoint(id)
    endpoints.value = endpoints.value.filter(e => e.id !== id)
    if (currentEndpoint.value?.id === id) currentEndpoint.value = null
  }

  async function loadRoutes(endpointId: string): Promise<void> {
    isLoading.value = true
    errorMessage.value = ''
    try {
      routes.value = await listRoutes(endpointId)
    } catch (e: any) {
      errorMessage.value = e?.message || 'Failed to load routes'
    } finally {
      isLoading.value = false
    }
  }

  async function createRouteAndRefresh(input: Partial<GatewayRoute> & { endpointId: string }): Promise<GatewayRoute> {
    const created = await createRoute(input)
    routes.value.push(created)
    return created
  }

  async function updateRouteAndRefresh(id: string, input: Partial<GatewayRoute>): Promise<GatewayRoute> {
    const updated = await updateRoute(id, input)
    const idx = routes.value.findIndex(r => r.id === id)
    if (idx >= 0) routes.value[idx] = updated
    if (currentRoute.value?.id === id) currentRoute.value = updated
    return updated
  }

  async function removeRoute(id: string): Promise<void> {
    await deleteRoute(id)
    routes.value = routes.value.filter(r => r.id !== id)
    if (currentRoute.value?.id === id) currentRoute.value = null
  }

  async function testRouteAndGetSchema(routeId: string): Promise<GatewaySchema> {
    const result = await testRoute(routeId)
    currentSchema.value = {
      id: '',
      routeId,
      schema: result.schema,
      samplePayload: result.sample,
      inferredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    return currentSchema.value
  }

  async function loadSchema(routeId: string): Promise<void> {
    try {
      currentSchema.value = await getRouteSchema(routeId)
    } catch {
      currentSchema.value = null
    }
  }

  async function refreshRouteSchema(routeId: string): Promise<void> {
    const result = await refreshSchema(routeId)
    currentSchema.value = {
      id: '',
      routeId,
      schema: result.schema,
      samplePayload: null,
      inferredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as GatewaySchema
  }

  async function refreshPlugins(): Promise<void> {
    try {
      plugins.value = await listPlugins()
    } catch {
      plugins.value = []
    }
  }

  return {
    endpoints, currentEndpoint, routes, currentRoute, currentSchema, plugins,
    isLoading, errorMessage, activeEndpoints,
    refreshEndpoints, loadEndpoint,
    createEndpointAndRefresh, updateEndpointAndRefresh, removeEndpoint,
    loadRoutes, createRouteAndRefresh, updateRouteAndRefresh, removeRoute,
    testRouteAndGetSchema, loadSchema, refreshRouteSchema, refreshPlugins,
  }
})