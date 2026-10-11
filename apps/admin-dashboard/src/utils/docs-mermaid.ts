// Draws the ```mermaid blocks of a rendered documentation page (the server turns them into `<pre><code class="language-mermaid">` and
// leaves them as inert text). The library is loaded only when a page has one; `securityLevel: 'strict'` makes it encode the diagram's
// text and ignore click handlers and raw HTML. A diagram that cannot be drawn keeps its code. The generated sites do the same in
// packages/publish/src/docs-site.ts (their own script, the library copied next to the site).
let counter = 0

export async function drawMermaid(root: HTMLElement | null): Promise<void> {
  if (!root) return
  const blocks = [...root.querySelectorAll<HTMLElement>('pre > code.language-mermaid')]
  if (!blocks.length) return
  let mermaid: typeof import('mermaid').default
  try {
    mermaid = (await import('mermaid')).default
  } catch {
    return
  }
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.querySelector('.light') ? 'default' : 'dark' })
  for (const code of blocks) {
    const pre = code.parentElement
    if (!pre || !pre.isConnected) continue
    const id = `doc-mermaid-${++counter}`
    try {
      const { svg } = await mermaid.render(id, code.textContent ?? '')
      if (!pre.isConnected) continue
      const box = document.createElement('div')
      box.className = 'doc-mermaid'
      box.innerHTML = svg
      pre.replaceWith(box)
    } catch {
      document.getElementById(`d${id}`)?.remove()
    }
  }
}
