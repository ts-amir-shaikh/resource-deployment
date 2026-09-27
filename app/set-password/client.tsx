'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { api, errorMessage } from '@/lib/client';
import { Field } from '@/components/ui';

const MIN = 10;

export default function SetPasswordClient() {
  // The code arrives after # (lib/accounts/links.ts). Read it once, then drop
  // it from the address bar so it is not left in history or a screenshot.
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const match = window.location.hash.match(/[#&]t=([A-Za-z0-9_-]+)/);
    if (match) {
      setToken(match[1]);
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      // A second run of this effect (React runs it twice in development) finds
      // the address already cleaned: keep the code read the first time.
      setToken((prev) => prev ?? '');
    }
  }, []);

  const mismatch = confirm.length > 0 && confirm !== password;
  const tooShort = password.length > 0 && password.length < MIN;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || tooShort || mismatch) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/set-password', { method: 'POST', json: { token, password } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            RD
          </div>
          <div>
            <div className="text-base font-semibold text-ink">Resource Deployment</div>
            <div className="text-xs text-ink3">Techstalwarts</div>
          </div>
        </div>

        <div className="card p-5">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <KeyRound className="h-4 w-4 text-ink3" />
            Set your password
          </h1>

          {done ? (
            <div className="mt-3 space-y-4 text-sm text-ink2">
              <p>Your password is set. Sign in with your email address and the new password.</p>
              <Link href="/login" className="btn-primary w-full justify-center">
                Go to sign in
              </Link>
            </div>
          ) : token === '' ? (
            <p className="mt-3 text-sm text-ink2">
              This link is incomplete. Open it again from the email, or ask Admin to send a new one.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              {error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                  {error}
                </div>
              )}
              <Field label="New password" required error={tooShort ? `Use at least ${MIN} characters.` : undefined}>
                <input
                  id="new-password"
                  className="input"
                  type="password"
                  autoFocus
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Type it again" required error={mismatch ? 'The two passwords do not match.' : undefined}>
                <input
                  id="confirm-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={busy || !token || password.length < MIN || confirm !== password}
              >
                {busy ? 'Saving…' : 'Set password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
