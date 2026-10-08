// Notification e-mail of a public form (POST /public/forms/:classId/submit). The visitor's request carries the form's
// `notify` block (recipient, template, subject) because the page's script has it in hand - but anyone can send that
// request with any block, so on its own it would let a stranger make this server send mail to an address and with a
// subject of their choosing (a mail relay). The server therefore only honours a block that an author put in a form
// of a page (the same tuple, for the same target class); everything else is ignored.

export interface NotifyConfig {
  enabled?: boolean;
  mailTemplateId?: string;
  templatePageId?: string;
  recipientEmail?: string;
  subject?: string;
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Identity of a notify block for one target class: what an author configured, nothing else counts. */
export function notifyKey(targetClassId: unknown, n: NotifyConfig | null | undefined): string {
  return JSON.stringify([s(targetClassId), s(n?.mailTemplateId), s(n?.templatePageId), s(n?.recipientEmail), s(n?.subject)]);
}

/** Every enabled notify block of every form in the given pages, as keys, each with the website of the page it was
 *  authored in: the mail goes out with that website's mail configuration. */
export function collectAuthoredNotify(pages: Iterable<{ content: unknown; websiteId: string | null }>): Map<string, { websiteId: string | null }> {
  const found = new Map<string, { websiteId: string | null }>();
  for (const page of pages) {
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;
      const rec = node as Record<string, unknown>;
      const form = rec.formConfig as { targetClassId?: unknown; notify?: NotifyConfig } | null | undefined;
      if (form?.notify?.enabled) {
        const key = notifyKey(form.targetClassId, form.notify);
        if (!found.has(key)) found.set(key, { websiteId: page.websiteId });
      }
      Object.values(rec).forEach(walk);
    };
    walk(page.content);
  }
  return found;
}

/** Every enabled notify block of every form in the given content trees, as keys. */
export function collectAuthoredNotifyKeys(contents: Iterable<unknown>): Set<string> {
  return new Set(collectAuthoredNotify([...contents].map((content) => ({ content, websiteId: null }))).keys());
}

/** A single plain address: no list, no header injection, no display name. */
export function isSingleEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@,;<>"'()[\]\\:]+@[^\s@,;<>"'()[\]\\:]+\.[^\s@,;<>"'()[\]\\:]+$/.test(value);
}

/** At most `max` mails per recipient in `windowMs`: a confirmation template whose recipient is the visitor's own
 *  address can otherwise be used to send the same message to one victim again and again. */
export function createRecipientThrottle(max = 3, windowMs = 60 * 60 * 1000, now: () => number = Date.now) {
  const seen = new Map<string, number[]>();
  return {
    /** true = send (and counts it); false = over the limit. */
    take(recipient: string): boolean {
      const key = recipient.trim().toLowerCase();
      const t = now();
      const recent = (seen.get(key) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= max) { seen.set(key, recent); return false; }
      recent.push(t);
      seen.set(key, recent);
      if (seen.size > 5000) for (const [k, v] of seen) if (v.every((x) => t - x >= windowMs)) seen.delete(k);
      return true;
    },
  };
}

/** Authored blocks, read from the pages at most every `ttlMs` (a submit must not scan every page). */
export function createAuthoredNotifyCache(load: () => Promise<Iterable<{ content: unknown; websiteId: string | null }>>, ttlMs = 30_000, now: () => number = Date.now) {
  let found: Map<string, { websiteId: string | null }> | null = null;
  let loadedAt = 0;
  const fresh = async () => {
    if (!found || now() - loadedAt > ttlMs) {
      found = collectAuthoredNotify(await load());
      loadedAt = now();
    }
    return found;
  };
  return {
    /** The block's website, or null when no form has this block. */
    async lookup(key: string): Promise<{ websiteId: string | null } | null> { return (await fresh()).get(key) ?? null; },
    async has(key: string): Promise<boolean> { return (await fresh()).has(key); },
    clear(): void { found = null; },
  };
}
