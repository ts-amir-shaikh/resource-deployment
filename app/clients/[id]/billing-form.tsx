'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, isApiError } from '@/lib/client';
import { Field } from '@/components/ui';

type Billing = {
  gstin: string | null;
  billingAddress: string | null;
  paymentTerms: string | null;
  defaultDueDays: number | null;
};

/**
 * M62 (G-ACC-02). Billing details saved through their own route, so Accounts
 * can edit them without the right to rewrite or delete the client. Management
 * sees the same panel read-only: the global read-only banner already disables
 * its buttons, and the server refuses the write regardless.
 */
export default function BillingForm({ clientId, initial }: { clientId: number; initial: Billing }) {
  const router = useRouter();
  const [form, setForm] = useState({
    gstin: initial.gstin ?? '',
    billingAddress: initial.billingAddress ?? '',
    paymentTerms: initial.paymentTerms ?? '',
    defaultDueDays: initial.defaultDueDays?.toString() ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);
    try {
      await api(`/api/clients/${clientId}/billing`, { method: 'PUT', json: form });
      setMessage({ ok: true, text: 'Billing details saved.' });
      router.refresh();
    } catch (err) {
      if (isApiError(err)) {
        setErrors(err.fields ?? {});
        setMessage({ ok: false, text: err.message });
      } else {
        setMessage({ ok: false, text: 'Something went wrong.' });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 p-4 sm:grid-cols-2">
      <Field label="GSTIN" error={errors.gstin} hint="15 characters, e.g. 27AAPFU0939F1ZV">
        <input className="input uppercase" value={form.gstin} onChange={set('gstin')} maxLength={15} />
      </Field>
      <Field
        label="Default due days"
        error={errors.defaultDueDays}
        hint="Fills the due date of a new invoice, counted from its invoice date"
      >
        <input className="input" inputMode="numeric" value={form.defaultDueDays} onChange={set('defaultDueDays')} />
      </Field>
      <Field label="Payment terms" error={errors.paymentTerms} className="sm:col-span-2">
        <input className="input" value={form.paymentTerms} onChange={set('paymentTerms')} placeholder="e.g. Net 30" />
      </Field>
      <Field label="Billing address" error={errors.billingAddress} className="sm:col-span-2">
        <textarea className="input min-h-[72px]" value={form.billingAddress} onChange={set('billingAddress')} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save billing details'}
        </button>
        {message && (
          <span className={`text-xs ${message.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{message.text}</span>
        )}
      </div>
    </form>
  );
}
