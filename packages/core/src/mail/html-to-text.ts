// Minimal, dependency-free HTML -> plain-text fallback. Built for one
// specific job: turning render-mail-template.ts's own output (static,
// well-formed, script-free email markup) into the `textContent` an ESP
// campaign API wants alongside `htmlContent` - not a general-purpose HTML
// parser for arbitrary third-party markup. Good enough to be "reasonable"
// is the bar here, not "perfect": most email providers (Brevo included)
// can derive their own plain-text part from HTML when none is given, so
// this is a quality nicety, not something recipients depend on for the
// email to work.
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (match, name) => ENTITIES[name] ?? match)
}

/** Converts rendered mail-template HTML to a plain-text fallback: drops
 *  <script>/<style> content, turns `<a href>` into "label (url)", turns
 *  block-level closing tags into line breaks, strips the remaining
 *  markup, decodes entities, and collapses blank-line runs. */
export function htmlToPlainText(html: string): string {
  const withoutScripts = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
  const withLinks = withoutScripts.replace(
    /<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) => `${label.replace(/<[^>]+>/g, '')} (${href})`,
  )
  const withBreaks = withLinks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
  const stripped = decodeEntities(withBreaks.replace(/<[^>]+>/g, ''))

  const lines = stripped.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim())
  const collapsed: string[] = []
  for (const line of lines) {
    if (line === '' && collapsed[collapsed.length - 1] === '') continue
    collapsed.push(line)
  }
  return collapsed.join('\n').trim()
}
