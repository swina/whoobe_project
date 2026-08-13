import nodemailer from 'nodemailer';
import { getMailSettings } from '../db/mail-settings-records.js';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

/** Builds a fresh transport from getMailSettings() on every call rather
 *  than caching one - settings can change at runtime via the admin UI.
 *  Throws if no settings have been configured yet; callers (the form-submit
 *  route) catch this and log a warning instead of failing the submission. */
export async function sendMail({ to, subject, html }: SendMailInput): Promise<void> {
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

  const from = settings.fromName ? `"${settings.fromName}" <${settings.fromAddress}>` : settings.fromAddress;

  await transport.sendMail({ from, to, subject, html });
}
