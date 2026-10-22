// Deployment settings (API addresses, fonts, placeholder pictures). The container writes them into /config.js at start
// (nginx/render-runtime-config.sh), so one prebuilt image serves any workspace; values baked in at build time
// (VITE_*) remain the fallback, so building per workspace keeps working.
declare global {
  interface Window {
    __WHOOBE_CONFIG__?: Record<string, string>
  }
}

export function runtimeEnv(name: string): string | undefined {
  const value = typeof window !== 'undefined' ? window.__WHOOBE_CONFIG__?.[name] : undefined
  if (typeof value === 'string' && value !== '') return value
  return (import.meta.env as Record<string, string | undefined>)[name]
}
