// The element tree of the editor (sidebar > Tree): moving rows by drag and drop and with the keyboard/buttons. A drop is "before /
// inside / after that row", shown while dragging; nothing is lost; an element cannot be put into itself.
import { test, expect, EDITOR_URL, ADMIN_URL, pageContent, richText, container } from './fixtures'

test('elements are reordered and re-parented in the tree by drag and drop, keyboard and buttons', async ({ api, authed, tag }) => {
  const doc = pageContent([
    container('boxa', [richText('a1', 'first A'), richText('a2', 'second A')], 'flex'),
    container('boxb', [], 'flex'),
    richText('t1', 'loose one'),
    richText('t2', 'loose two'),
  ])
  const page = await api.post('/whoobe-one/pages', { slug: `tree-${tag}`, title: `tree ${tag}`, content: doc })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  const id = page.json.page.id
  try {
    const p = await authed.newPage()
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
    await p.locator('#t1').waitFor({ timeout: 20_000 })
    await p.getByTitle('Tree', { exact: true }).click()
    const row = (rid: string) => p.locator(`[data-tree-id="${rid}"]`)
    await row('t1').waitFor({ timeout: 10_000 })

    /** The tree as text: ids in order, each prefixed by its depth. */
    const shape = async () => (await p.locator('[data-tree-id]').evaluateAll((els) => els.map((e) => {
      const pad = parseFloat((e as HTMLElement).style.paddingLeft)
      return `${Math.round((pad - 0.5) / 0.75)}${(e as HTMLElement).dataset.treeId}`
    }))).join(' ')
    expect(await shape()).toBe('0doc-root 1boxa 2a1 2a2 1boxb 1t1 1t2')

    // 1. a loose element dropped on the middle of a container goes INSIDE it (last)
    await row('t1').dragTo(row('boxb'))
    expect(await shape()).toBe('0doc-root 1boxa 2a1 2a2 1boxb 2t1 1t2')

    // 2. dropped on the upper edge of a row it goes BEFORE it, on the lower edge AFTER it - across levels
    const box = (await row('a1').boundingBox())!
    await row('t2').dragTo(row('a1'), { targetPosition: { x: 40, y: 2 } })
    expect(await shape()).toBe('0doc-root 1boxa 2t2 2a1 2a2 1boxb 2t1')
    await row('t2').dragTo(row('a2'), { targetPosition: { x: 40, y: box.height - 2 } })
    expect(await shape()).toBe('0doc-root 1boxa 2a1 2a2 2t2 1boxb 2t1')

    // 3. moving down inside the same list lands where the line was (no off-by-one)
    await row('a1').dragTo(row('t2'), { targetPosition: { x: 40, y: box.height - 2 } })
    expect(await shape()).toBe('0doc-root 1boxa 2a2 2t2 2a1 1boxb 2t1')

    // 3b. selecting a container does NOT re-root the tree on it: the whole page stays in view (the "Selection" switch gives the old view)
    await row('boxa').click()
    expect(await shape()).toBe('0doc-root 1boxa 2a2 2t2 2a1 1boxb 2t1')
    await p.getByTestId('tree-scope-selection').click()
    expect(await shape()).toBe('0boxa 1a2 1t2 1a1')
    await p.getByTestId('tree-scope-page').click()
    expect(await shape()).toBe('0doc-root 1boxa 2a2 2t2 2a1 1boxb 2t1')

    // 4. a container cannot go into itself or into its own children: nothing changes
    await row('boxa').dragTo(row('a2'))
    expect(await shape()).toBe('0doc-root 1boxa 2a2 2t2 2a1 1boxb 2t1')
    await row('boxa').dragTo(row('boxa'))
    expect(await shape()).toBe('0doc-root 1boxa 2a2 2t2 2a1 1boxb 2t1')

    // 5. the keyboard: Alt+arrows on the selected row (one step), and the same with the buttons
    await row('a1').click()
    await p.keyboard.press('Alt+ArrowUp')
    expect(await shape()).toBe('0doc-root 1boxa 2a2 2a1 2t2 1boxb 2t1')
    await p.keyboard.press('Alt+ArrowLeft')                       // out of boxa, right after it
    expect(await shape()).toBe('0doc-root 1boxa 2a2 2t2 1a1 1boxb 2t1')
    await p.keyboard.press('Alt+ArrowRight')                      // into the previous sibling (boxa), last
    expect(await shape()).toBe('0doc-root 1boxa 2a2 2t2 2a1 1boxb 2t1')
    await row('a1').getByRole('button', { name: 'Move down' }).click()
    await row('a1').getByRole('button', { name: 'Move down' }).click()
    expect(await shape()).toBe('0doc-root 1boxa 2a2 2t2 2a1 1boxb 2t1')   // already last in boxa: stays
    await row('a1').getByRole('button', { name: 'Move out' }).click()
    await row('a1').getByRole('button', { name: 'Move in' }).click()
    expect(await shape()).toBe('0doc-root 1boxa 2a2 2t2 2a1 1boxb 2t1')

    // the canvas follows the tree, and no element was lost
    const onCanvas = await p.evaluate(() => [...document.querySelectorAll('#a1, #a2, #t2')].map((e) => `${e.id}${e.closest('#boxa') ? '@boxa' : ''}`))
    expect(onCanvas).toEqual(['a2@boxa', 't2@boxa', 'a1@boxa'])
    await expect(p.locator('#t1')).toBeVisible()
  } finally {
    await api.delete(`/whoobe-one/pages/${id}`)
  }
})
