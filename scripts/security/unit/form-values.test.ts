// The values a published form sends (packages/sdk/renderer/src/form-values.ts): files are uploaded first and replaced by references.
import { describe, it, expect } from 'vitest'
import { collectFormValues, FormUploadError, submitErrorMessage } from '../../../packages/sdk/renderer/src/form-values'

const fileInput = (name: string, id: string, files: { name: string }[], dataId?: string) => ({
  name, id, files,
  getAttribute: (a: string) => (a === 'data-whoobe-upload' ? dataId ?? null : null),
})
const formWith = (inputs: unknown[]) => ({ querySelectorAll: () => inputs })
const entries = (e: [string, unknown][]) => ({ entries: () => e })

describe('collectFormValues', () => {
  it('keeps the text values and replaces a chosen file by the reference of its upload', async () => {
    const calls: string[] = []
    const v = await collectFormValues(
      formWith([fileInput('cv', 'ignored', [{ name: 'cv.pdf' }], 'up-1')]),
      async (fieldId, file) => { calls.push(`${fieldId}:${file.name}`); return { uploadId: 'u-1' } },
      entries([['title', 'Ann'], ['cv', { name: 'cv.pdf' }]]),
    )
    expect(v).toEqual({ title: 'Ann', cv: { uploadId: 'u-1' } })
    expect(calls).toEqual(['up-1:cv.pdf'])
  })
  it('several files become a list, in order, uploaded one after the other', async () => {
    const order: string[] = []
    const v = await collectFormValues(
      formWith([fileInput('docs', 'f2', [{ name: 'a.pdf' }, { name: 'b.pdf' }])]),
      async (_id, file) => { order.push(file.name); return { uploadId: `id-${file.name}` } },
      entries([]),
    )
    expect(v).toEqual({ docs: [{ uploadId: 'id-a.pdf' }, { uploadId: 'id-b.pdf' }] })
    expect(order).toEqual(['a.pdf', 'b.pdf'])
  })
  it('an empty file input sends nothing (not an empty file)', async () => {
    const v = await collectFormValues(formWith([fileInput('cv', 'f', [])]), async () => { throw new Error('no') }, entries([['cv', { name: '' }], ['t', 'x']]))
    expect(v).toEqual({ t: 'x' })
  })
  it('a form without a way to upload refuses a chosen file, and says so', async () => {
    await expect(collectFormValues(formWith([fileInput('cv', 'f', [{ name: 'a.pdf' }])]), undefined, entries([]))).rejects.toBeInstanceOf(FormUploadError)
    await expect(collectFormValues(formWith([fileInput('cv', '', [{ name: 'a.pdf' }])]), async () => ({ uploadId: 'x' }), entries([]))).rejects.toBeInstanceOf(FormUploadError)
  })
  it('a refused file stops the submission with the server message', async () => {
    const refuse = async () => { throw new FormUploadError('The file is larger than 2 MB') }
    await expect(collectFormValues(formWith([fileInput('cv', 'f', [{ name: 'a.pdf' }])]), refuse, entries([]))).rejects.toThrow('larger than 2 MB')
  })
})

describe('submitErrorMessage', () => {
  it("shows the server's words for an upload refusal (escaped) and the form's own message otherwise", () => {
    expect(submitErrorMessage(new FormUploadError('Allowed file types: pdf, png'), 'Oops')).toBe('Allowed file types: pdf, png')
    expect(submitErrorMessage(new FormUploadError('<img src=x onerror=alert(1)>'), 'Oops')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(submitErrorMessage(new Error('status 500'), 'Oops')).toBe('Oops')
    expect(submitErrorMessage(new Error('x'), undefined)).toBe('Something went wrong, please try again.')
  })
})
