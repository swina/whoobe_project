// A visitor attaches a file to a form on a published page: it is uploaded first, the form is sent with a reference to it, and the
// file ends up as a private asset referenced by the new object. A file the website does not allow is refused with the server's words.
import { test, expect, EDITOR_URL, ADMIN_URL, pageContent } from './fixtures'

const field = (id: string, name: string, type: string, extra: object = {}) => ({
  id, tag: 'input', type: 'element', element: 'input', label: 'Input', editable: false, content: null, blocks: [], css: { css: 'border block', container: '' },
  data: { attributes: { type, name, ...(type === 'file' ? { accept: '.pdf,.png' } : {}) } }, ...extra,
})

test('a file chosen in a form is uploaded and attached to the submission', async ({ api, authed, tag }) => {
  const site = await api.post('/whoobe-one/websites', { name: `FU ${tag}`, rootPath: `/fu${tag}` })
  expect(site.status, site.text.slice(0, 150)).toBe(201)
  const websiteId = site.json.website.id
  const cls = await api.post('/data-classes', { name: `FU${tag}`, label: 'FU', fields: [{ name: 'title', title: 'Title', fieldType: 'input' }, { name: 'cv', title: 'CV', fieldType: 'manyToOneRelation' }] })
  const classId = cls.json.class.id
  let pageId = ''
  try {
    expect((await api.put(`/whoobe-one/websites/${websiteId}/upload-settings`, { enabled: true, allowedExtensions: ['pdf', 'png', 'txt'], maxFileBytes: 50_000, maxFiles: 1, targetFolder: `private/fu-${tag}` })).status).toBe(200)
    const form = {
      id: 'frm', tag: 'form', type: 'container', element: 'form', semantic: 'form', editable: false, content: null, css: { css: '', container: '' },
      data: { attributes: { name: 'form', action: '', method: 'post' } },
      formConfig: { enabled: true, targetClassId: classId, successMessage: 'Thank you', errorMessage: 'Failed', notify: { enabled: false } },
      blocks: [field('t1', 'title', 'text'), field('cvf', 'cv', 'file', { uploadConfig: { extensions: ['pdf', 'png'] } }),
        { id: 'go', tag: 'button', type: 'element', element: 'button', label: 'Button', editable: false, content: 'Send', data: { attributes: { type: 'submit' } }, blocks: [], css: { css: '', container: '' } }],
    }
    const page = await api.post('/whoobe-one/pages', { slug: `/fu-${tag}`, title: 'fu', content: pageContent([form]), websiteId })
    expect(page.status, page.text.slice(0, 150)).toBe(201)
    pageId = page.json.page.id
    await api.patch(`/whoobe-one/pages/${pageId}`, { published: true })

    const p = await authed.newPage()
    await p.goto(`${EDITOR_URL}/whoobe-one/fu${tag}/fu-${tag}`)
    const file = p.locator('form input[type="file"]')
    await file.waitFor({ timeout: 15_000 })
    expect(await file.getAttribute('data-whoobe-upload')).toBe('cvf')
    expect(await file.getAttribute('accept')).toBe('.pdf,.png')

    // a type the website does not allow for this field: refused, with the reason
    await p.locator('form input[name="title"]').fill('Ann')
    await file.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await p.locator('form button').first().click()
    await expect(p.getByText(/Allowed file types|not accepted/i)).toBeVisible({ timeout: 10_000 })
    await p.mouse.click(5, 5) // closes the message

    // a file that is not what its name says
    await file.setInputFiles({ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf at all') })
    await p.locator('form button').first().click()
    await expect(p.getByText(/valid \.pdf/i)).toBeVisible({ timeout: 10_000 })
    await p.mouse.click(5, 5)

    // a real one
    await file.setInputFiles({ name: 'My CV.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\nbrowser-cv\n%%EOF\n') })
    await p.locator('form button').first().click()
    await expect(p.getByText('Thank you')).toBeVisible({ timeout: 15_000 })

    await expect.poll(async () => (await api.get(`/data-objects?classId=${classId}`)).json?.objects?.length ?? 0, { timeout: 10_000 }).toBe(1)
    const obj = (await api.get(`/data-objects?classId=${classId}`)).json.objects[0]
    expect(obj.attributes.title).toBe('Ann')
    expect(obj.attributes.cv.assetId).toMatch(/^[0-9a-f-]{36}$/)
    void ADMIN_URL
  } finally {
    if (pageId) await api.delete(`/whoobe-one/pages/${pageId}`)
    await api.delete(`/whoobe-one/websites/${websiteId}`)
    await api.delete(`/data-classes/${classId}`)
  }
})

test('the File Upload element can be added from the palette and configured in Advanced', async ({ api, authed, tag }) => {
  const page = await api.post('/whoobe-one/pages', { slug: `fup-${tag}`, title: `fup ${tag}`, content: pageContent([]) })
  expect(page.status, page.text.slice(0, 150)).toBe(201)
  const id = page.json.page.id
  try {
    const p = await authed.newPage()
    await p.setViewportSize({ width: 1500, height: 950 })
    await p.goto(`${EDITOR_URL}/whoobe-one/editor?pageId=${id}&parentOrigin=${encodeURIComponent(ADMIN_URL)}`)
    await p.locator('#whoobe-editor-canvas').waitFor({ timeout: 20_000 })
    await p.getByTestId('editor-toolbar').getByRole('button', { name: 'Elements', exact: true }).click()
    await p.getByTestId('editor-panel').getByRole('button', { name: 'form', exact: true }).click()
    const chip = p.getByTestId('editor-panel').locator('[data-template="File Upload"]')
    await expect(chip).toBeVisible()
    // drop it on the page, then its own section appears in Advanced
    await chip.dragTo(p.locator('#whoobe-editor-canvas'), { targetPosition: { x: 200, y: 120 } })
    const input = p.locator('#whoobe-editor-canvas input[type="file"]')
    await expect(input).toHaveCount(1, { timeout: 10_000 })
    await p.getByRole('button', { name: 'Advanced', exact: true }).click()
    const section = p.getByTestId('upload-field')
    if (!(await section.isVisible())) await p.getByText('File upload', { exact: true }).first().click()
    await expect(section).toBeVisible({ timeout: 10_000 })
    await section.getByTestId('upload-ext-pdf').check()
    await section.getByTestId('upload-max-files').fill('3')
    await section.getByTestId('upload-max-files').blur()
    // what the browser's file dialog is told, and several files allowed
    await expect(input).toHaveAttribute('accept', '.pdf')
    await expect(input).toHaveAttribute('multiple', '')
  } finally {
    await api.delete(`/whoobe-one/pages/${id}`)
  }
})
