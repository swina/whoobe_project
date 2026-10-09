// The values of a submitted form, files included (docs/plans/forms/form-upload-plan.md). A file input is not sent with the form:
// each chosen file is uploaded first (an "intent" answered with a ticket, then the bytes), and the form carries `{ uploadId }` in
// its place. The DOM is only touched through the few members used here, so this runs in a browser and under test alike.

/** Raised when a file could not be uploaded; `message` is what the server said (safe to show to the visitor). */
export class FormUploadError extends Error {
  readonly isFormUploadError = true
}

export type UploadOne = (fieldId: string, file: any) => Promise<{ uploadId: string }>

/** The name of the attribute that carries the id of an Upload field in the DOM (set by the renderers). */
export const UPLOAD_FIELD_ATTRIBUTE = 'data-whoobe-upload'

export async function collectFormValues(
  formEl: any,
  uploadOne?: UploadOne,
  formData: { entries(): Iterable<[string, unknown]> } = new FormData(formEl),
): Promise<Record<string, unknown>> {
  const attributes: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') attributes[key] = value // files are replaced below
  }
  const inputs: any[] = Array.from(formEl.querySelectorAll('input[type="file"]'))
  for (const input of inputs) {
    const name: string = input.name
    if (!name) continue
    const files: any[] = Array.from(input.files ?? [])
    if (files.length === 0) continue
    const fieldId: string | null = input.getAttribute(UPLOAD_FIELD_ATTRIBUTE) || input.id || null
    if (!fieldId || !uploadOne) throw new FormUploadError('File upload is not available on this page')
    const refs: { uploadId: string }[] = []
    for (const file of files) refs.push({ uploadId: (await uploadOne(fieldId, file)).uploadId })
    attributes[name] = refs.length === 1 ? refs[0] : refs
  }
  return attributes
}

/** The message to show for a failed submit: the server's own words when a file was refused (HTML-escaped, it is shown as markup by
 *  some adapters), otherwise the form's configured error message. */
export function submitErrorMessage(err: unknown, configured: string | undefined): string {
  if (err && typeof err === 'object' && (err as { isFormUploadError?: boolean }).isFormUploadError) {
    return String((err as Error).message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  return configured || 'Something went wrong, please try again.'
}
