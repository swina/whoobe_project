export interface GatewayBinding {
  endpointName: string
  routePath: string
  fieldPath: string
  params?: Record<string, string> | null
  rowsPerPage?: number | null
  paginationMode?: 'standard' | 'lazyload' | null
  loadMoreText?: string | null
  loadMoreClass?: string | null
  paginationContainerClass?: string | null
}