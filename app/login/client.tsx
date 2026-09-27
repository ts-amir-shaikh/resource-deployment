'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, LogIn } from 'lucide-react';
import { api, errorMessage } from '@/lib/client';
import { Field } from '@/components/ui';
import { canAccess } from '@/lib/access';
import { pathOf, safeNext } from '@/lib/accounts/redirect';
import type { Role } from '@/lib/auth';

type LoginResult = { role: Role; name: string; landing: string };

/** Google sign-in comes back here with a code, never with an address. */
const GOOGLE_ERRORS: Record<string, string> = {
  google_no_account:
    'That Google account does not match an account that can sign in here. Use the email Admin registered for you.',
  google_failed: 'Google sign-in did not complete. Try again, or sign in with your password.',
  google_off: 'Google sign-in is not set up on this server. Sign in with your password.',
};

export default function LoginClient({
  hasAccounts,
  googleEnabled,
}: {
  hasAccounts: boolean;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next')) ?? '/';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(GOOGLE_ERRORS[params.get('error') ?? ''] ?? null);
  const googleHref = `/api/auth/google/start${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`;
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = (await api('/api/auth/login', {
        method: 'POST',
        json: hasAccounts ? { identifier, password } : { password },
      })) as LoginResult;

      // A TA who was bounced to /login from a page their role can't open must
      // not be sent straight back to it — that would loop.
      const target = canAccess(result.role, pathOf(next)) ? next : result.landing;

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

          {error && (
            <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              {error}
            </div>
          )}

          {googleEnabled && (
            <>
              {/* A full navigation, not a fetch: Google's page has to take over the tab. */}
              <a href={googleHref} className="btn-ghost mt-5 w-full justify-center">
                <GoogleMark />
                Sign in with Google
              </a>
              <div className="mt-4 flex items-center gap-3 text-2xs uppercase tracking-wide text-ink3">
                <span className="h-px flex-1 bg-line" />
                or with your password
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <form onSubmit={submit} className={googleEnabled ? 'mt-4 space-y-3' : 'mt-5 space-y-3'}>

            {hasAccounts && (
              <Field label="Email" required hint="Until Admin adds your email, your username still works.">
                <input
                  className="input"
                  autoFocus
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
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
              disabled={busy || !password || (hasAccounts && !identifier.trim())}
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

/** Google's four-colour G, as its brand guidelines ask the button to show. */
function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
