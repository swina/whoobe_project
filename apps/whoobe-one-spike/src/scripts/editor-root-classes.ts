// Classes the editor puts on a document's root for its canvas (and the defaults of older documents), never meant for the
// rendered page: removed whenever an editor document is rendered outside the editor (device preview, print from editor).
const EDITOR_ONLY_CLASSES = ['whoobe-canvas-root', 'editor-custom']
const LEGACY_ROOT_CLASSES = ['gap-4', 'min-h-[600px]', 'bg-white', 'p-6']

/** The document with its root's editor-only classes removed (in place; returned for convenience). */
export function stripEditorRootClasses<T>(doc: T): T {
  const css = (doc as any)?.css
  if (css?.container) {
    css.container = String(css.container).split(' ').filter((c: string) => ![...EDITOR_ONLY_CLASSES, ...LEGACY_ROOT_CLASSES].includes(c)).join(' ')
  }
  return doc
}
