// Lazily loads YouTube's official IFrame Player API and wraps an already-
// rendered <iframe> (from BlockIFrame.vue) in a real `YT.Player` instance,
// so FloatingToolbar.vue's "Play" button can call the documented
// `.playVideo()` method instead of guessing at YouTube's raw postMessage
// wire format directly. The raw-postMessage approach tried first didn't
// reliably work: it's an undocumented protocol the official API itself is
// built on top of, and it silently does nothing if sent before the
// embedded page's internal listener has finished initializing - there's
// no ready signal to wait for without the real API. `YT.Player` handles
// that handshake itself via its own `onReady` event.
//
// Not a new dependency - loaded the same way @tailwindcss/browser is in
// main.ts (a dynamically-created <script> tag), except this one really is
// meant to be loaded that way (YouTube's own documented integration
// method), not a workaround for a package that assumes a <script> tag.
let apiPromise: Promise<void> | null = null

function loadApi(): Promise<void> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    if ((window as any).YT?.Player) {
      resolve()
      return
    }
    const previousCallback = (window as any).onYouTubeIframeAPIReady
    ;(window as any).onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return apiPromise
}

const players = new WeakMap<HTMLIFrameElement, Promise<any>>()

function getPlayer(iframe: HTMLIFrameElement): Promise<any> {
  let player = players.get(iframe)
  if (!player) {
    player = loadApi().then(
      () =>
        new Promise((resolve) => {
          const YT = (window as any).YT
          const instance = new YT.Player(iframe, { events: { onReady: () => resolve(instance) } })
        })
    )
    players.set(iframe, player)
  }
  return player
}

export async function playYouTubeVideo(iframe: HTMLIFrameElement): Promise<void> {
  const player = await getPlayer(iframe)
  player.playVideo()
}
