import 'server-only';
import nodemailer from 'nodemailer';
import type { MailMessage } from './mail-templates';

/**
 * Sends email from the company's Google Workspace mailbox over SMTP, using an
 * app password (KTD5). Kept behind this one function so moving to the Gmail
 * API or Amazon SES later touches nothing else.
 *
 * Never throws: every caller must be able to tell Admin a link did not go out
 * (R18), so a failure is a returned value, not an exception something above
 * might swallow.
 *
 * Settings (server-only):
 *   MAIL_USER          the sending mailbox, e.g. no-reply@techstalwarts.com
 *   MAIL_APP_PASSWORD  an app password for it (needs 2-step verification)
 *   MAIL_FROM          optional display sender; defaults to MAIL_USER
 *   MAIL_HOST / MAIL_PORT  optional; default smtp.gmail.com:465
 */

export type SendResult = { ok: true } | { ok: false; reason: string };

export function isMailConfigured(): boolean {
  return Boolean((process.env.MAIL_USER || '').trim() && (process.env.MAIL_APP_PASSWORD || '').trim());
}

export async function sendMail(to: string, message: MailMessage): Promise<SendResult> {
  if (!isMailConfigured()) return { ok: false, reason: 'Email is not configured on this server.' };

  const user = (process.env.MAIL_USER || '').trim();
  const port = Number(process.env.MAIL_PORT || 465);
  try {
    const transport = nodemailer.createTransport({
      host: (process.env.MAIL_HOST || 'smtp.gmail.com').trim(),
      port,
      secure: port === 465,
      auth: { user, pass: (process.env.MAIL_APP_PASSWORD || '').trim() },
      // Fail fast inside a request rather than holding it open.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
    await transport.sendMail({
      from: (process.env.MAIL_FROM || '').trim() || user,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[mail]', detail);
    return { ok: false, reason: 'The email could not be sent. Check the mail settings and try again.' };
  }
}
