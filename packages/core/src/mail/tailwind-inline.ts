import { twj } from 'tw-to-css'

// Converts Tailwind utility classes into inline CSS styles for email bodies
// (docs/plans/forms/mail-templates.md consideration C5, implemented 2026-08-
// 15). Email clients don't load stylesheets - the editor's own Tailwind
// (and the CDN/browser runtime that generates it) can't ship in an email,
// so a template that only carries `class="p-8 flex ..."` renders as
// unstyled text. Inline styles are the only widely-supported way to style
// an email, so every element's Tailwind classes are compiled to a `style`
// attribute at render time (the `class` attribute is kept alongside for
// reference and for any client that does load CSS).
//
// `twj` runs Tailwind's JIT per call (expensive), so results are cached by
// the full class string - a mail template has a small, bounded set of
// class strings. Interaction variants (hover:/focus:/group-*:) are dropped:
// a static email has no hover state, and applying a hover-only background
// as a permanent color would be wrong.

const STATE_VARIANT_RE =
  /^(hover|focus|focus-visible|focus-within|active|visited|disabled|checked|group-hover|group-focus|group|first|last|odd|even|only|placeholder|required|invalid|read-only|target|before|after|selection|marker|open|motion-safe|motion-reduce|contrast-more|contrast-less|print|landscape|portrait|dark|light):/

const cache = new Map<string, string>()

function toCssString(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(';')
}

/** Compiles a Tailwind class string (`p-8 flex flex-col`) to an inline CSS
 *  declaration string (`padding:2rem;display:flex;flex-direction:column`).
 *  Unknown classes are skipped; an empty input yields an empty string. */
export function tailwindToInlineCss(classString: string): string {
  const trimmed = classString.trim()
  if (!trimmed) return ''

  const cached = cache.get(trimmed)
  if (cached !== undefined) return cached

  const tokens = trimmed.split(/\s+/).filter((t) => !STATE_VARIANT_RE.test(t))
  const clean = tokens.join(' ')

  let styles: Record<string, string> = {}
  if (clean) {
    try {
      styles = twj(clean) as Record<string, string>
    } catch {
      // A single problematic class shouldn't kill the whole element - fall
      // back to compiling each token independently.
      for (const token of tokens) {
        try {
          styles = { ...styles, ...(twj(token) as Record<string, string>) }
        } catch {
          // Unknown/unsupported class - leave it as a class only.
        }
      }
    }
  }

  const css = toCssString(styles)
  if (cache.size > 500) cache.clear()
  cache.set(trimmed, css)
  return css
}
