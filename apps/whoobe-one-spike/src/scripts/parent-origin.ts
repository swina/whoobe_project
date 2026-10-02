// Origin of the page embedding this app (the admin-dashboard), used as the
// targetOrigin of every window.parent.postMessage() so editor/preview data is
// never handed to an arbitrary embedder (a '*' target would deliver it to
// whoever framed us). Resolved once at load, while the URL still carries the
// `?parentOrigin=` the admin passes to /editor; falls back to the referrer's
// origin (e.g. the Page > Preview iframe), then to our own origin. If none is
// right the message is simply dropped, which is the safe failure.
function resolveParentOrigin(): string {
  if (typeof window === 'undefined') return ''
  try {
    const p = new URLSearchParams(window.location.search).get('parentOrigin')
    if (p) return new URL(p).origin
  } catch { /* malformed -> next source */ }
  try {
    if (document.referrer) return new URL(document.referrer).origin
  } catch { /* ignore */ }
  return window.location.origin
}

const parentOrigin = resolveParentOrigin()

export function parentTargetOrigin(): string {
  return parentOrigin
}
