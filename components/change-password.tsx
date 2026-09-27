'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/client';
import { Field, Modal } from '@/components/ui';

const MIN = 10;

/**
 * Changing your own password (R10). Your other devices are signed out on
 * their next click (R21); this one stays signed in.
 */
export default function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function close() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    setDone(false);
    onClose();
  }

  const tooShort = next.length > 0 && next.length < MIN;
  const mismatch = confirm.length > 0 && confirm !== next;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/password', { method: 'POST', json: { current, next } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Change password">
      {done ? (
        <div className="space-y-4 text-sm text-ink2">
          <p>Your password is changed. Any other device you were signed in on will ask you to sign in again.</p>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={close}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              {error}
            </div>
          )}
          <Field label="Current password" required>
            <input
              id="current-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="New password" required error={tooShort ? `Use at least ${MIN} characters.` : undefined}>
            <input
              id="change-new-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Type it again" required error={mismatch ? 'The two passwords do not match.' : undefined}>
            <input
              id="change-confirm-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={close}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || !current || next.length < MIN || confirm !== next}
            >
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
