// Audio element helpers (components/AudioPlayer.vue): the element's options with their defaults, the peaks of a
// decoded track, and a cache so the same file is fetched and decoded once however many players show it.
// No imports on purpose: the pure parts (normalizeAudioOptions, computePeaks) can be run by Node directly.

export interface AudioOptions {
  /** 'player' = the browser's own <audio controls>; 'waveform' = custom player with the waveform of the track. */
  mode: 'player' | 'waveform'
  controls: boolean
  autoplay: boolean
  loop: boolean
  preload: 'none' | 'metadata' | 'auto'
  waveColor: string
  progressColor: string
  /** Waveform height in px. */
  height: number
}

export const AUDIO_DEFAULTS: AudioOptions = {
  mode: 'player',
  controls: true,
  autoplay: false,
  loop: false,
  preload: 'metadata',
  waveColor: '#cbd5e1',
  progressColor: '#6366f1',
  height: 64,
}

// A colour typed by an administrator ends up in canvas.fillStyle, which ignores what it cannot parse; keep only
// plain colour syntax anyway so a value never carries anything else.
const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/deg-]+\)|[a-z]{3,20})$/i

/** Merges what is stored on the element with the defaults, tolerating any shape (old or hand-edited documents). */
export function normalizeAudioOptions(raw: unknown): AudioOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const color = (v: unknown, d: string) => (typeof v === 'string' && COLOR.test(v.trim()) ? v.trim() : d)
  const height = Number(o.height)
  return {
    mode: o.mode === 'waveform' ? 'waveform' : 'player',
    controls: bool(o.controls, AUDIO_DEFAULTS.controls),
    autoplay: bool(o.autoplay, AUDIO_DEFAULTS.autoplay),
    loop: bool(o.loop, AUDIO_DEFAULTS.loop),
    preload: o.preload === 'none' || o.preload === 'auto' ? o.preload : 'metadata',
    waveColor: color(o.waveColor, AUDIO_DEFAULTS.waveColor),
    progressColor: color(o.progressColor, AUDIO_DEFAULTS.progressColor),
    height: Number.isFinite(height) ? Math.min(240, Math.max(16, Math.round(height))) : AUDIO_DEFAULTS.height,
  }
}

/**
 * Reduces decoded samples to `buckets` peak values in 0..1: the loudest absolute sample of each slice, scaled so the
 * loudest slice of the whole track is 1 (a quiet recording still fills the height). Silence gives all zeros.
 */
export function computePeaks(samples: ArrayLike<number>, buckets: number): number[] {
  const n = Math.max(1, Math.floor(buckets))
  const peaks = new Array<number>(n).fill(0)
  const len = samples.length
  if (len === 0) return peaks
  const size = len / n
  let max = 0
  for (let b = 0; b < n; b++) {
    const start = Math.floor(b * size)
    const end = Math.min(len, Math.max(start + 1, Math.floor((b + 1) * size)))
    let peak = 0
    // sample a slice at most ~1000 points wide: enough for a visual peak, and keeps a long track fast
    const step = Math.max(1, Math.floor((end - start) / 1000))
    for (let i = start; i < end; i += step) {
      const v = Math.abs(samples[i])
      if (v > peak) peak = v
    }
    peaks[b] = peak
    if (peak > max) max = peak
  }
  return max > 0 ? peaks.map((p) => p / max) : peaks
}

/** Stable pseudo-peaks for a placeholder drawn while the real ones load, or when they cannot be computed. */
export function placeholderPeaks(seed: string, buckets: number): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const out: number[] = []
  for (let i = 0; i < buckets; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)
    const r = ((h >>> 0) % 1000) / 1000
    out.push(0.25 + 0.6 * r * (0.55 + 0.45 * Math.sin(i / 6)))
  }
  return out
}

const MAX_BYTES = 40 * 1024 * 1024
const cache = new Map<string, Promise<number[]>>()
const RESOLUTION = 800

/**
 * Fetches and decodes the track and returns its peaks (cached per URL). Rejects when the file cannot be read: a
 * cross-origin URL without CORS headers, a format the browser cannot decode, a file over 40 MB. The caller then falls
 * back to the plain player, which does not need any of this.
 */
export function loadPeaks(url: string): Promise<number[]> {
  let p = cache.get(url)
  if (!p) {
    p = (async () => {
      // public assets and third-party URLs answer without credentials; a private asset needs the session cookie
      let res: Response
      try { res = await fetch(url, { credentials: 'omit' }) } catch { res = await fetch(url, { credentials: 'include' }) }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const declared = Number(res.headers.get('content-length') || 0)
      if (declared > MAX_BYTES) throw new Error('audio file too large to draw')
      const bytes = await res.arrayBuffer()
      if (bytes.byteLength > MAX_BYTES) throw new Error('audio file too large to draw')
      const Ctx = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext
      // decoding does not need a running AudioContext (and an offline one never trips the autoplay policy)
      const decoded: AudioBuffer = await new Ctx(1, 1, 44100).decodeAudioData(bytes)
      return computePeaks(decoded.getChannelData(0), RESOLUTION)
    })()
    cache.set(url, p)
    p.catch(() => cache.delete(url))
  }
  return p
}
