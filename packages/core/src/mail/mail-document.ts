// Email document wrapping and font handling (docs/plans/forms/mail-templates.
// md). Email clients can't load the editor's stylesheet, and only a few
// (Apple Mail / iOS Mail) load web fonts at all - Gmail and Outlook strip
// them and fall back to the recipient's local fonts. So a font set in the
// editor is handled two ways here:
//
//  1. The element's `font-family` gets a web-safe fallback stack, so when
//     the webfont can't load the email still degrades to a sensible face
//     (serif faces fall back to Georgia, sans faces to Segoe UI/Arial).
//  2. The rendered body is wrapped in a full HTML document whose <head>
//     links the Google Fonts CSS for every font the template uses - the
//     clients that support web fonts (Apple Mail, iOS Mail) then load the
//     exact face the admin picked.

/** A `font-family` value with a web-safe fallback for a Google Font family
 *  name stored in the editor's `font` field ("Open+Sans" → the quoted
 *  name plus a sans/serif fallback). */
export function fontFamilyStack(font: string): string {
  const name = font.replaceAll('+', ' ')
  const serif = /(serif|slab|alice|alegreya|amethysta|lora|quattrocento|ultra|playfair|cormorant|merriweather|garamond)/i.test(font)
  return serif
    ? `"${name}", Georgia, 'Times New Roman', serif`
    : `"${name}", 'Segoe UI', Helvetica, Arial, sans-serif`
}

/** Wraps an email body fragment in a standalone HTML document with a
 *  `<head>` that loads the given Google Fonts (only for clients that
 *  support web fonts; the fallback stacks above cover the rest). */
export function buildMailDocument(input: { bodyHtml: string; fonts?: string[] }): string {
  const families = (input.fonts ?? []).filter(Boolean)
  const fontLinks = families.length
    ? `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap" rel="stylesheet">`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">${fontLinks}
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0">
${input.bodyHtml}
</body>
</html>`
}
