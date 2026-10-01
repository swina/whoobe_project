// Turns arbitrary text (a page/object title, or whatever an editor pasted
// into a slug field) into a friendly URL slug - lowercase, ASCII,
// hyphen-separated. Shared by PageCreateForm.vue/PageSettingsTab.vue's
// "Pages > slug" generator button and DataObjectFieldControl.vue's
// `urlSlug` field generator button, so both follow the exact same rules.
export function slugify(text: string): string {
  return text
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents (é -> e, ñ -> n, ...)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
