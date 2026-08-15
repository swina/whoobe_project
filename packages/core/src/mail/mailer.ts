import nodemailer from 'nodemailer';
import { getMailSettings } from '../db/mail-settings-records.js';
import { logMailDelivery } from '../db/mail-log-records.js';
import type { MailTemplateRecord } from '../db/mail-templates-records.js';
import { renderTemplateContent, collectMailFonts } from './render-mail-template.js';
import { substituteTokensPlain } from './token-substitution.js';
import { buildMailDocument } from './mail-document.js';
import { resolveMailImageUrls } from './mail-image-urls.js';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  /** Optional override of the configured from address (used by the
   *  mail-settings "Email Test" flow, which lets an admin send from an
   *  arbitrary address to check delivery). */
  from?: string;
  cc?: string;
  /** Explicit blind copy (CCN). When the mail settings' `bccFromAddress`
   *  flag is on, the configured from address is appended to this. */
  bcc?: string;
  text?: string;
}

/** Builds a fresh transport from getMailSettings() on every call rather
 *  than caching one - settings can change at runtime via the admin UI.
 *  Throws if no settings have been configured yet; callers (the form-submit
 *  route) catch this and log a warning instead of failing the submission. */
export async function sendMail({ to, subject, html, from, cc, bcc, text }: SendMailInput): Promise<void> {
  const settings = await getMailSettings();
  if (!settings) {
    throw new Error('Mail settings are not configured');
  }

  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user ? { user: settings.user, pass: settings.password ?? undefined } : undefined,
  });

  const defaultFrom = settings.fromName ? `"${settings.fromName}" <${settings.fromAddress}>` : settings.fromAddress;
  const fromAddress = from || defaultFrom;

  // The "BCC the from address" flag keeps a copy of every outgoing email at
  // the configured from address - combined with any explicit bcc so both
  // recipients receive it.
  const bccAddresses = [bcc, settings.bccFromAddress ? settings.fromAddress : undefined]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join(', ');

  // Every send attempt is logged (Settings → Mail → Log), success and
  // failure alike. The two concerns are deliberately decoupled: a failing
  // log write must never change the send result, and a failed send must
  // still be recorded before the error is rethrown to the caller.
  let sendError: unknown = null;
  try {
    await transport.sendMail({
      from: fromAddress,
      to,
      cc: cc || undefined,
      bcc: bccAddresses || undefined,
      subject,
      text: text || undefined,
      html,
    });
  } catch (error) {
    sendError = error;
  }
  try {
    await logMailDelivery({
      to,
      from: fromAddress,
      cc: cc || null,
      subject,
      html: html || null,
      text: text || null,
      status: sendError ? 'failed' : 'sent',
      error: sendError ? (sendError instanceof Error ? sendError.message : String(sendError)) : null,
    });
  } catch (logError) {
    console.warn('Mail log write failed:', logError);
  }
  if (sendError) throw sendError;
}

/** Single path for any app email backed by a mail template (docs/plans/
 *  forms/mail-templates.md consideration C7) - renders the body by kind
 *  (Element tree for `html`, token-substituted plain text for `text`),
 *  token-substitutes the subject and the recipient, then sends through
 *  sendMail(), which records the attempt in the mail log automatically.
 *  Throws if mail settings aren't configured or no recipient can be
 *  resolved; callers decide whether that's fatal. */
export async function sendMailFromTemplate(input: {
  template: MailTemplateRecord;
  context: Record<string, unknown>;
  /** Explicit recipient - wins over the template's own `to` field. */
  to?: string;
  cc?: string;
  /** Explicit blind copy (CCN) - wins over the template's own `bcc` field. */
  bcc?: string;
  /** Overrides the template's default subject. */
  subject?: string;
}): Promise<void> {
  const { template, context } = input;

  const subject = substituteTokensPlain(input.subject || template.subject || '', context);

  // Recipient resolution: an explicit `to` (e.g. a Form's notify
  // recipientEmail) wins; otherwise the template's own `to` field is used,
  // which can be dynamic ({form.email}). An empty result throws - a mail
  // needs a recipient.
  const recipient = (input.to && input.to.trim() ? input.to : (template.to ?? '')).trim();
  if (!recipient) {
    throw new Error('No recipient email configured for this mail template');
  }
  const to = substituteTokensPlain(recipient, context).trim();
  if (!to) {
    throw new Error('Recipient email resolved to an empty value');
  }

  // BCC (CCN) resolution mirrors `to`: an explicit bcc wins over the
  // template's own dynamic `bcc` field. An empty result is just omitted.
  const bccSource = input.bcc && input.bcc.trim() ? input.bcc : (template.bcc ?? '');
  const bcc = substituteTokensPlain(bccSource, context).trim() || undefined;

  let html = '';
  let text: string | undefined;
  if (template.kind === 'html') {
    // DAM-picked images are stored as stable references - resolve them to
    // public URLs before rendering (see mail-image-urls.ts).
    const imageUrls = await resolveMailImageUrls(template.content);
    // The body fragment is wrapped in a full HTML document whose <head>
    // links the Google Fonts for the fonts the template uses - clients
    // that support web fonts (Apple Mail) render the exact face the admin
    // picked; the font-family fallback stacks cover the rest.
    const bodyHtml = renderTemplateContent(template.content, context, imageUrls);
    html = buildMailDocument({ bodyHtml, fonts: collectMailFonts(template.content) });
    if (template.body) text = substituteTokensPlain(template.body, context);
  } else {
    // Text bodies go out as text/plain - values must not be HTML-escaped
    // (that would print literal &amp;/&lt;), but control characters are
    // stripped the same way subject lines are.
    text = substituteTokensPlain(template.body ?? '', context);
  }

  await sendMail({
    to,
    cc: input.cc,
    bcc,
    subject,
    html,
    text,
  });
}
