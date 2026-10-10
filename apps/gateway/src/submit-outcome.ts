// The outcome of a form submission: a short key the service behind the form answers (an n8n workflow replies
// `{ "outcome": "qualified" }`). It is the only part of that reply the page acts on, so it is checked here: a plain key,
// never text or markup. Same rule as sanitizeOutcome() in @whoobe-cms/renderer (form-result.ts), which checks it again in the
// visitor's browser. See docs/plans/automations/form-result-event.md.
const OUTCOME_KEY = /^[A-Za-z0-9_-]{1,32}$/;

export function extractOutcome(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>).outcome;
  return typeof value === 'string' && OUTCOME_KEY.test(value) ? value : null;
}
