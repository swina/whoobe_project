// crypto.randomUUID() is only exposed in secure contexts (HTTPS, or
// literally the hostname "localhost") - plain HTTP over a LAN hostname
// (e.g. this project's own develop.local dev setup) throws
// "crypto.randomUUID is not a function". crypto.getRandomValues() has no
// such restriction, so this falls back to a hand-rolled RFC 4122 v4 UUID
// built from it whenever the native method isn't available.
export function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
