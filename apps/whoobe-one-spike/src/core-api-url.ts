export function getDefaultCoreApiUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const port = window.location.port
    return `${window.location.protocol}//${window.location.hostname}${port ? `:${port}` : ''}`
  }
  return 'http://localhost:3000'
}