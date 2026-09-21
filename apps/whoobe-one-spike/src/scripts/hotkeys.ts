// Port of whoobe-one-studio's src/scripts/hotkeys.js. The source registers
// its `window.addEventListener('keydown', ...)` as a *side effect of the
// module being imported* (not inside a Vue plugin install() the way
// editor.js/database.js/gsap.js are) - ported the same way here via an
// explicit `setupHotkeys()` call (from App.vue's onMounted) rather than an
// import-time side effect, since import-time side effects are harder to
// reason about and control in a component-based app (would fire even
// during, say, a future unit test importing this module).
//
// Bus calls updated from `editorBus.$emit`/`dialogBus.$emit` (Vue-instance
// buses, removed in Vue 3) to the mitt-based buses in bus.ts - see port
// plan §2 item 1. Store access goes through Pinia instead of reading
// `store.state.editor` once at module scope - `useEditorStore()` returns
// the same singleton instance on every call within one Pinia instance, so
// this is the same "resolve once, read live" shape as the original.
//
// Phase 2 update: Alt+D/C/V now call the real editor-actions.ts functions
// (duplicate/copy/paste), since those are ported and real now. Still
// deliberately inert, same as the source itself doesn't implement them in
// this file: the Tailwind customizer (Alt+Z), GSAP animation picker
// (Alt+A - FloatingToolbar's own animation picker is the real one, not
// this hotkey), custom-JS/CSS editors, the shortcuts help dialog,
// fullscreen preview. Each of those still emits its bus event exactly as
// before, staying inert until the feature it targets is actually built -
// faithful to the source's own scope, not a gap introduced by this port.
import Element from './ElementsClass.js'
import { useEditorStore } from '../store/editor'
import { editorBus, dialogBus } from '../bus'
import { removeNodeById, applyImagePlaceholder } from '../helpers'
import { duplicateCurrent, copyCurrentToClipboard, pasteClipboardInto } from './editor-actions'

let copiedCss: { css: { css: string; container: string }; style: string; font: string } | null = null

export const shortcuts: Record<string, string> = {
  R: 'Remove selected block',
  D: 'Duplicate selected block',
  C: 'Copy selected block',
  V: 'Paste block',
  G: 'Copy block CSS and style',
  H: 'Paste CSS and style',
  K: 'Keyboard Shortcuts',
  Z: 'Customizer',
  '+': 'Add element',
  '<': 'Edit CSS and style',
  N: 'Preview',
  '1': 'Add Grid',
  '2': 'Add Flexbox',
  '3': 'Add Heading',
  '4': 'Add Paragraph',
  '5': 'Add Inline Text',
  '6': 'Add Image',
  '7': 'Add Button',
}

let installed = false

// BlockElement.vue's inline text editing uses real `contenteditable`, and
// the app has plain text inputs elsewhere (e.g. FloatingToolbar's fields) -
// Ctrl/Cmd+C/V must not hijack native copy/paste while a user is typing in
// either, so this listener only steps in outside those targets.
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function setupHotkeys(): void {
  if (installed) return
  installed = true

  const editor = useEditorStore()

  window.addEventListener('keydown', (e) => {
    // Ctrl+C/V (Cmd on Mac) - the standard copy/paste chord, alongside the
    // ported Alt+C/Alt+V below (kept working for anyone already used to
    // them). Any element in the canvas can be copied; paste targets
    // whatever's currently selected via pasteClipboardInto's own
    // container/sibling/root resolution (editor-actions.ts).
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && !isEditableTarget(e.target)) {
      if (editor.current) {
        copyCurrentToClipboard(editor)
        editorBus.emit('editorMessage', 'Block copied')
      }
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && !isEditableTarget(e.target)) {
      if (editor.document) {
        e.preventDefault()
        pasteClipboardInto(editor)
        editorBus.emit('editorMessage', 'Block pasted')
      }
      return
    }

    // Remove selected block - the one hotkey with an immediately real
    // effect already in this spike (FloatingToolbar's delete button uses
    // the same removeNodeById; not extracted into a shared helper since
    // it's four lines either place, and helpers.ts stays store-agnostic).
    if (e.altKey && e.code === 'KeyR') {
      if (editor.current && editor.document && editor.current.id !== editor.document.id) {
        const id = editor.current.id
        editor.setCurrent(null)
        removeNodeById(editor.document, id)
      }
      return
    }

    if (e.altKey && e.code === 'KeyD') {
      if (editor.current) {
        duplicateCurrent(editor)
        editorBus.emit('editorMessage', 'Block duplicated')
      }
      return
    }

    if (e.altKey && e.code === 'KeyC') {
      if (editor.current) {
        copyCurrentToClipboard(editor)
        editorBus.emit('editorMessage', 'Block copied')
      }
      return
    }

    if (e.altKey && e.code === 'KeyV') {
      if (editor.document) {
        pasteClipboardInto(editor)
        editorBus.emit('editorMessage', 'Block pasted')
      }
      return
    }

    if (e.altKey && e.code === 'KeyG') {
      if (editor.current) {
        const el = editor.current
        copiedCss = {
          css: { css: el.css.css ?? '', container: el.css.container ?? '' },
          style: el.style ?? '',
          font: el.font ?? '',
        }
        editorBus.emit('editorMessage', 'CSS & style copied')
      }
      return
    }

    if (e.altKey && e.code === 'KeyH') {
      if (editor.current && copiedCss) {
        const el = editor.current
        el.css.css = copiedCss.css.css
        el.css.container = copiedCss.css.container
        el.style = copiedCss.style
        el.font = copiedCss.font
        editorBus.emit('editorMessage', 'CSS & style pasted')
      }
      return
    }

    if (e.altKey && e.code === 'KeyK') {
      dialogBus.emit('shortcuts', 'block')
      return
    }

    if (e.altKey && e.code === 'KeyL') {
      if (editor.current) editorBus.emit('linkBlock', 'block')
      return
    }

    if (e.altKey && e.code === 'KeyZ') {
      if (editor.current) editorBus.emit('customizeBlock', 'block')
      return
    }

    if (e.altKey && e.code === 'KeyA') {
      if (editor.current) editorBus.emit('animationBlock', 'block')
      return
    }

    if (e.altKey && e.key === '+') {
      if (editor.current) editorBus.emit('addBlock', 'block')
      return
    }

    if (e.altKey && e.key === '<') {
      if (editor.current) editorBus.emit('cssBlock', 'block')
      return
    }

    if (e.altKey && e.code === 'KeyN') {
      editorBus.emit('preview', 'fullscreen')
      return
    }

    // Alt+1..7: quick-add directly into the selected container's children -
    // these work immediately, same as Alt+R, since they only need
    // ElementsClass (already ported) and don't depend on any not-yet-built
    // dialog/panel.
    if (e.altKey && e.key === '1' && editor.current?.blocks) {
      editor.current.blocks.push(new Element().Grid().Cols(2))
      return
    }
    if (e.altKey && e.key === '2' && editor.current?.blocks) {
      editor.current.blocks.push(new Element().Flexbox())
      return
    }
    if (e.altKey && e.key === '3' && editor.current?.blocks) {
      editor.current.blocks.push(new Element().Heading(1))
      return
    }
    if (e.altKey && e.key === '4' && editor.current?.blocks) {
      editor.current.blocks.push(new Element().Paragraph())
      return
    }
    if (e.altKey && e.key === '5' && editor.current?.blocks) {
      editor.current.blocks.push(new Element().InlineText())
      return
    }
    if (e.altKey && e.key === '6' && editor.current?.blocks) {
      // Without a placeholder this renders as an empty/broken <img> with no
      // src - invisible on the canvas, indistinguishable from the hotkey
      // doing nothing at all (see BlockEditor.vue's own drop-handler call
      // to the same helper, and applyImagePlaceholder()'s own doc comment).
      const img = new Element().Image()
      applyImagePlaceholder(img)
      editor.current.blocks.push(img)
      return
    }
    if (e.altKey && e.key === '7' && editor.current?.blocks) {
      editor.current.blocks.push(new Element().Button())
      return
    }
  })
}
