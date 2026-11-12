'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, isApiError } from '@/lib/client';
import { Field } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/utils';

export type ReceiptRow = {
  id: number;
  receivedDate: string;
  amount: number;
  tdsDeducted: number;
  note: string | null;
  source: string;
  reversesId: number | null;
  reversed: boolean;
};
export type CreditRow = { id: number; creditDate: string; amount: number; gstAmount: number; reason: string };

type Msg = { ok: boolean; text: string } | null;

function useAction() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, done: string, reset?: () => void) {
    setBusy(true);
    setErrors({});
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: done });
      reset?.();
      router.refresh();
    } catch (err) {
      if (isApiError(err)) {
        setErrors(err.fields ?? {});
        setMsg({ ok: false, text: err.message });
      } else setMsg({ ok: false, text: 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }
  return { errors, msg, busy, run };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Payments: entered by Accounts, reversed by counter-entry, never edited. */
export function PaymentsPanel({
  invoiceId,
  currency,
  receipts,
  canEdit,
  canReceive,
}: {
  invoiceId: number;
  currency: string;
  receipts: ReceiptRow[];
  canEdit: boolean;
  canReceive: boolean;
}) {
  const { errors, msg, busy, run } = useAction();
  const blank = { receivedDate: todayIso(), amount: '', tdsDeducted: '', note: '' };
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      {receipts.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-ink3">No payments recorded.</p>
      ) : (
        <ul className="divide-y divide-line">
          {receipts.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
              <div>
                <div className={`tnum font-medium ${r.amount < 0 ? 'text-rose-600' : 'text-ink'}`}>
                  {formatMoney(r.amount, currency)}
                  {r.tdsDeducted !== 0 && <span className="ml-2 text-xs font-normal text-ink3">TDS {formatMoney(r.tdsDeducted, currency)}</span>}
                </div>
                <div className="text-2xs text-ink3">
                  {formatDate(r.receivedDate)} · {r.source === 'integration' ? 'from Tally' : 'entered'}
                  {r.reversesId ? ` · reverses #${r.reversesId}` : ''}
                  {r.reversed ? ' · reversed' : ''}
                  {r.note ? ` · ${r.note}` : ''}
                </div>
              </div>
              {canEdit && !r.reversed && !r.reversesId && (
                <button
                  className="btn-ghost btn text-xs"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm('Reverse this payment? A counter-entry is added; nothing is deleted.')) return;
                    run(() => api(`/api/invoices/${invoiceId}/receipts/${r.id}/reverse`, { method: 'POST', json: {} }), 'Payment reversed.');
                  }}
                >
                  Reverse
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && canReceive && (
        <form
          className="grid gap-3 border-t border-line p-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api(`/api/invoices/${invoiceId}/receipts`, { method: 'POST', json: form }), 'Payment recorded.', () => setForm({ ...blank, receivedDate: form.receivedDate }));
          }}
        >
          <Field label="Received on" error={errors.receivedDate}>
            <input type="date" className="input" value={form.receivedDate} onChange={set('receivedDate')} />
          </Field>
          <Field label={`Amount (${currency})`} error={errors.amount}>
            <input className="input" inputMode="decimal" value={form.amount} onChange={set('amount')} />
          </Field>
          <Field label="TDS deducted" error={errors.tdsDeducted}>
            <input className="input" inputMode="decimal" value={form.tdsDeducted} onChange={set('tdsDeducted')} />
          </Field>
          <Field label="Note" error={errors.note} className="sm:col-span-3">
            <input className="input" value={form.note} onChange={set('note')} placeholder="UTR, cheque no., short-payment reason" />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Record payment'}
            </button>
            {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</span>}
          </div>
        </form>
      )}
      {!(canEdit && canReceive) && msg && <p className={`px-4 pb-3 text-xs ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}

/** Credit notes: cancel all or part of a raised invoice; never edited or deleted. */
export function CreditNotesPanel({
  invoiceId,
  currency,
  invoiceAmount,
  invoiceGst,
  credits,
  canEdit,
  canIssue,
}: {
  invoiceId: number;
  currency: string;
  invoiceAmount: number;
  invoiceGst: number;
  credits: CreditRow[];
  canEdit: boolean;
  canIssue: boolean;
}) {
  const { errors, msg, busy, run } = useAction();
  const blank = { creditDate: todayIso(), amount: '', gstAmount: '', reason: '' };
  const [form, setForm] = useState(blank);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const creditedAmount = credits.reduce((s, c) => s + c.amount, 0);
  const creditedGst = credits.reduce((s, c) => s + c.gstAmount, 0);
  const left = { amount: Math.round((invoiceAmount - creditedAmount) * 100) / 100, gst: Math.round((invoiceGst - creditedGst) * 100) / 100 };

  return (
    <div>
      {credits.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-ink3">No credit notes.</p>
      ) : (
        <ul className="divide-y divide-line">
          {credits.map((c) => (
            <li key={c.id} className="px-4 py-2.5 text-sm">
              <div className="tnum font-medium text-ink">
                {formatMoney(c.amount + c.gstAmount, currency)}
                {c.gstAmount > 0 && <span className="ml-2 text-xs font-normal text-ink3">incl. GST {formatMoney(c.gstAmount, currency)}</span>}
              </div>
              <div className="text-2xs text-ink3">
                {formatDate(c.creditDate)} · {c.reason}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && canIssue && (left.amount > 0 || left.gst > 0) && (
        <form
          className="grid gap-3 border-t border-line p-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!confirm('Issue this credit note? It cannot be edited or deleted afterwards.')) return;
            run(() => api(`/api/invoices/${invoiceId}/credit-notes`, { method: 'POST', json: form }), 'Credit note issued.', () => setForm(blank));
          }}
        >
          <Field label="Credit date" error={errors.creditDate}>
            <input type="date" className="input" value={form.creditDate} onChange={set('creditDate')} />
          </Field>
          <Field label={`Amount before GST (up to ${left.amount})`} error={errors.amount}>
            <input className="input" inputMode="decimal" value={form.amount} onChange={set('amount')} />
          </Field>
          <Field label={`GST (up to ${left.gst})`} error={errors.gstAmount}>
            <input className="input" inputMode="decimal" value={form.gstAmount} onChange={set('gstAmount')} />
          </Field>
          <Field label="Reason" error={errors.reason} className="sm:col-span-3">
            <input className="input" value={form.reason} onChange={set('reason')} placeholder="Why the invoice is being credited" />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Issue credit note'}
            </button>
            <button type="button" className="btn-ghost btn" onClick={() => setForm((f) => ({ ...f, amount: String(left.amount), gstAmount: String(left.gst) }))}>
              Credit in full
            </button>
            {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</span>}
          </div>
        </form>
      )}
    </div>
  );
}

/** Proforma: an optional step ahead of Raised, with its own number. */
export function ProformaPanel({
  invoiceId,
  status,
  proformaNumber,
  canEdit,
}: {
  invoiceId: number;
  status: string;
  proformaNumber: string | null;
  canEdit: boolean;
}) {
  const { errors, msg, busy, run } = useAction();
  const [number, setNumber] = useState(proformaNumber ?? '');

  if (status === 'proforma') {
    return (
      <div className="space-y-3 p-4 text-sm">
        <div>
          Proforma <span className="font-mono font-medium text-ink">{proformaNumber}</span>. Not yet a tax invoice: it cannot receive payments.
        </div>
        {canEdit && (
          <button className="btn-primary" disabled={busy} onClick={() => run(() => api(`/api/invoices/${invoiceId}/advance`, { method: 'POST', json: {} }), 'Raised as a tax invoice.')}>
            Raise as tax invoice
          </button>
        )}
        {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
      </div>
    );
  }
  if (status !== 'not_raised') {
    return <p className="px-4 py-4 text-sm text-ink3">{proformaNumber ? `Raised from proforma ${proformaNumber}.` : 'No proforma was issued.'}</p>;
  }
  if (!canEdit) return <p className="px-4 py-4 text-sm text-ink3">No proforma issued.</p>;
  return (
    <form
      className="space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api(`/api/invoices/${invoiceId}/advance`, { method: 'POST', json: { targetStatus: 'proforma', proformaNumber: number } }), 'Proforma issued.');
      }}
    >
      <Field label="Proforma number" error={errors.proformaNumber} hint="Optional step: skip it to raise the invoice directly">
        <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} />
      </Field>
      <button type="submit" className="btn-ghost btn" disabled={busy}>
        Issue proforma
      </button>
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
    </form>
  );
}
