'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, isApiError } from '@/lib/client';
import { Modal } from '@/components/ui';

type Result = {
  period: { from: string; to: string };
  created: { invoiceId: number; projectId: number; amount: number; lines: number }[];
  skipped: { projectId: number; reason: string }[];
};

const lastMonth = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

/**
 * M62 slice C (G-ACC-06). Drafts the chosen month's invoices from billable
 * deployments. They arrive as Not Raised for review; nothing is raised. Safe to
 * press twice: a project already invoiced for the month is skipped.
 */
export default function DraftMonthButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(lastMonth());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<Result>('/api/invoices/drafts', { method: 'POST', json: { month } });
      setResult(r);
      router.refresh();
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn-ghost btn" onClick={() => setOpen(true)}>
        Draft month&apos;s invoices
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Draft the month's invoices">
        <div className="space-y-4 p-4 text-sm">
          <p className="text-ink2">
            Creates one Not Raised draft per project from billable deployments, priced with the usual day-count
            rules and approved timesheet leave. Review each draft before raising it.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Month</span>
            <input type="month" className="input w-48" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <button className="btn-primary" disabled={busy || !month} onClick={run}>
            {busy ? 'Drafting…' : 'Create drafts'}
          </button>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          {result && (
            <div className="space-y-1 text-xs">
              <p className="font-medium text-ink">
                {result.created.length} draft{result.created.length === 1 ? '' : 's'} created for {result.period.from.slice(0, 7)}.
              </p>
              {result.skipped.map((s, i) => (
                <p key={i} className="text-ink3">
                  Project #{s.projectId} skipped: {s.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
