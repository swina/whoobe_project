// Replaces whoobe-one-studio's five `new Vue()` event buses (eventBus/
// dialogBus/modalBus/editorBus/errorBus, see main.js in the source repo) -
// Vue 3's createApp() instances have no $on/$off/$emit at all, so the
// mechanical fix documented in the port plan (§2 item 1) is `mitt`, which
// has the same on/off/emit shape.
//
// Most of these event names (hotkeys.js, Phase 1) have no listener yet -
// they're wired up as later phases build the features they target (a
// clipboard, the Tailwind customizer, a GSAP animation picker, custom-JS/
// CSS editors, a shortcuts help dialog, fullscreen preview). Declaring them
// here now means hotkeys.js's emit calls are real, type-checked bus traffic
// rather than untyped `any` - listening for them is what's deferred, not
// the event contract itself.
import mitt from 'mitt'

export type EditorEvents = {
  floatingElement: string
  editorMessage: string
  duplicateBlock: KeyboardEvent
  copyBlock: unknown
  pasteBlock: string
  copyBlockCSS: string
  pasteBlockCSS: string
  linkBlock: string
  customizeBlock: string
  animationBlock: string
  addBlock: string
  cssBlock: string
  preview: string
  save: string
}

export const editorBus = mitt<EditorEvents>()
export const dialogBus = mitt<Record<string, unknown>>()
