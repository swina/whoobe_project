import { escapeHtml } from './field-transforms.js';

// Universal personalization syntax for mail templates (docs/plans/forms/
// mail-templates.md): `{namespace.field}` tokens in text templates, HTML
// template text, and subject lines. The `context` object is what a trigger
// builds - `{ form: {...submission}, site?, user?, object? }` - and a token
// resolves by dot-path against it. Today only the `form` namespace is ever
// populated; future triggers (workflow, invitations, AI) add their own
// namespaces without touching this engine.

const TOKEN_RE = /{([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)}/g;

/** Resolves a dot-path (`form.firstname`) against the context object.
 *  Shared with render-mail-template.ts, which resolves HTML `dataBinding`
 *  fields through the same lookup so both mechanisms stay consistent. */
export function resolveContextPath(context: Record<string, unknown>, path: string): unknown {
  let current: unknown = context;
  for (const part of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function stringify(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** Substitutes `{namespace.field}` tokens with their resolved values,
 *  HTML-escaping each one - the value is typically public form input
 *  flowing into an email body, so escaping is mandatory (same reasoning
 *  render-mail-template.ts already applies to dataBinding values). A
 *  missing path resolves to an empty string. */
export function substituteTokens(text: string, context: Record<string, unknown>): string {
  return text.replace(TOKEN_RE, (match, path: string) => escapeHtml(stringify(resolveContextPath(context, path))))
}

/** Token substitution for subject lines and other single-line headers: no
 *  HTML escaping, but CR/LF and control characters are stripped from each
 *  resolved value so a form field can't inject headers (header-injection
 *  guard - see docs/plans/forms/mail-templates.md consideration C5). */
export function substituteTokensPlain(text: string, context: Record<string, unknown>): string {
  return text.replace(TOKEN_RE, (match, path: string) => stringify(resolveContextPath(context, path)).replace(/[\r\n\x00-\x1f]/g, ' '))
}
