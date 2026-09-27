import { afterEach, describe, expect, it } from 'vitest';
import { isMailConfigured, sendMail } from './mail';
import { passwordLinkEmail } from './mail-templates';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe('passwordLinkEmail (R9)', () => {
  const msg = passwordLinkEmail({
    name: 'Priya Nair',
    setPasswordUrl: 'https://staffing.example/set-password#t=abc',
    signInUrl: 'https://staffing.example/login',
    kind: 'invite',
  });

  it('offers both ways in: Google sign-in and setting a password', () => {
    for (const body of [msg.text, msg.html]) {
      expect(body).toContain('https://staffing.example/login');
      expect(body).toContain('https://staffing.example/set-password#t=abc');
      expect(body).toMatch(/Sign in with Google/);
    }
  });

  it('greets the person by first name and states the link lifetime', () => {
    expect(msg.text).toContain('Hi Priya');
    expect(msg.text).toContain('72 hours');
  });

  it('escapes the name in the HTML body', () => {
    const html = passwordLinkEmail({
      name: '<script>x</script>',
      setPasswordUrl: 'https://a/b',
      signInUrl: 'https://a/login',
      kind: 'reset',
    }).html;
    expect(html).not.toContain('<script>');
  });

  it('a reset reads as a reset, not an invite', () => {
    const reset = passwordLinkEmail({ name: 'Priya', setPasswordUrl: 'https://a/b', signInUrl: 'https://a/l', kind: 'reset' });
    expect(reset.subject).toMatch(/new password/i);
    expect(msg.subject).not.toMatch(/new password/i);
  });
});

describe('sendMail (R18)', () => {
  it('reports "not configured" and sends nothing when mail settings are absent', async () => {
    delete process.env.MAIL_USER;
    delete process.env.MAIL_APP_PASSWORD;
    expect(isMailConfigured()).toBe(false);
    const r = await sendMail('a@b.co', { subject: 's', text: 't', html: '<p>t</p>' });
    expect(r).toEqual({ ok: false, reason: 'Email is not configured on this server.' });
  });

  it('returns a transport failure as a result instead of throwing', async () => {
    process.env.MAIL_USER = 'no-reply@example.com';
    process.env.MAIL_APP_PASSWORD = 'not-a-real-password';
    process.env.MAIL_HOST = '127.0.0.1';
    process.env.MAIL_PORT = '1';
    const r = await sendMail('a@b.co', { subject: 's', text: 't', html: '<p>t</p>' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/could not be sent/i);
  });
});
