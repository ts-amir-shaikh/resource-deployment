/**
 * The one email this feature sends: a link to set a password, which serves a
 * first invite and a reset alike (R7), and always offers Google sign-in as the
 * other way in (R9).
 */

export type MailMessage = { subject: string; text: string; html: string };

const LINK_HOURS = 72;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function passwordLinkEmail(opts: {
  name: string;
  setPasswordUrl: string;
  signInUrl: string;
  kind: 'invite' | 'reset';
}): MailMessage {
  const first = opts.name.trim().split(/\s+/)[0] || 'there';
  const subject =
    opts.kind === 'invite'
      ? 'Your Techstalwarts staffing platform account'
      : 'Set a new password for the Techstalwarts staffing platform';
  const opening =
    opts.kind === 'invite'
      ? 'An account has been set up for you on the Techstalwarts staffing platform.'
      : 'You asked for a new password on the Techstalwarts staffing platform.';

  const text = [
    `Hi ${first},`,
    '',
    opening,
    '',
    'You can sign in either way:',
    '',
    `Sign in with Google: ${opts.signInUrl}`,
    `  (works when this email address is a Google account)`,
    '',
    `Or set a password: ${opts.setPasswordUrl}`,
    `  (this link works once and expires in ${LINK_HOURS} hours)`,
    '',
    'If you were not expecting this email, you can ignore it.',
  ].join('\n');

  const html = `<p>Hi ${escapeHtml(first)},</p>
<p>${escapeHtml(opening)}</p>
<p>You can sign in either way:</p>
<p><a href="${escapeHtml(opts.signInUrl)}">Sign in with Google</a><br>
<small>Works when this email address is a Google account.</small></p>
<p><a href="${escapeHtml(opts.setPasswordUrl)}">Set a password</a><br>
<small>This link works once and expires in ${LINK_HOURS} hours.</small></p>
<p>If you were not expecting this email, you can ignore it.</p>`;

  return { subject, text, html };
}
