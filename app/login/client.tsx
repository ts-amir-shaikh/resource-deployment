'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, LogIn } from 'lucide-react';
import { api, errorMessage } from '@/lib/client';
import { Field } from '@/components/ui';
import { canAccess } from '@/lib/access';
import type { Role } from '@/lib/auth';

type LoginResult = { role: Role; name: string; landing: string };

export default function LoginClient({ hasAccounts }: { hasAccounts: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = (await api('/api/auth/login', {
        method: 'POST',
        json: hasAccounts ? { username, password } : { password },
      })) as LoginResult;

      // A TA who was bounced to /login from a page their role can't open must
      // not be sent straight back to it — that would loop.
      const target = canAccess(result.role, next.split('?')[0]) ? next : result.landing;

      // Full navigation so the new cookie is picked up by middleware.
      router.replace(target);
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
            {hasAccounts
              ? 'This workspace holds client and compensation data. Sign in with your account.'
              : 'This workspace holds client and compensation data. Enter the team password to continue.'}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                {error}
              </div>
            )}

            {hasAccounts && (
              <Field label="Username" required>
                <input
                  className="input"
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
            )}

            <Field label="Password" required>
              <input
                className="input"
                type="password"
                autoFocus={!hasAccounts}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={busy || !password || (hasAccounts && !username)}
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
