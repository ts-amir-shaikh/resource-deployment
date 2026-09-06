'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, LogIn } from 'lucide-react';
import { api, errorMessage } from '@/lib/client';
import { Field } from '@/components/ui';

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', json: { password } });
      // Full navigation so the new cookie is picked up by middleware.
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
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
            <Lock className="h-4 w-4 text-ink3" />
            Sign in
          </h1>
          <p className="mt-1 text-sm text-ink2">
            This workspace holds client and compensation data. Enter the team
            password to continue.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                {error}
              </div>
            )}

            <Field label="Password" required>
              <input
                className="input"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={busy || !password}
            >
              <LogIn className="h-4 w-4" />
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-2xs text-ink3">
          Shared requirement links stay open to consultants without signing in.
        </p>
      </div>
    </div>
  );
}
