'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileUp, AlertTriangle, Check } from 'lucide-react';
import { errorMessage } from '@/lib/client';
import { Modal, Field, Badge } from '@/components/ui';
import { PROSPECT_SOURCES } from '@/lib/leadgen-rules';
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  type ImportField,
  type ImportPlan,
} from '@/lib/leadgen-import';

type PreviewResponse = {
  headers: string[];
  mapping: Record<number, ImportField>;
  plan: ImportPlan;
  committed: boolean;
  prospectsCreated?: number;
  contactsCreated?: number;
};

const SOURCE_LABELS: Record<string, string> = {
  inbound: 'Inbound',
  referral: 'Referral',
  campaign: 'Campaign',
  event: 'Event',
  cold_outreach: 'Cold outreach',
  other: 'Other',
};

/**
 * M69 — upload, map, preview, commit.
 *
 * Nothing is written until the last button: the same file is posted again
 * with `commit`, exactly as the CLI importers take `--commit`, and the plan
 * is recomputed server-side so what is written is what was shown.
 */
export default function CampaignImport({
  campaignId,
  owners,
}: {
  campaignId: number;
  owners: { id: number; name: string }[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<number, ImportField>>({});
  const [updateExisting, setUpdateExisting] = useState(false);
  const [defaults, setDefaults] = useState({ industry: '', location: '', source: 'campaign', ownerUserId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ prospects: number; contacts: number } | null>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setMapping({});
    setError(null);
    setDone(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function post(theFile: File, opts: { mapping?: Record<number, ImportField>; commit?: boolean; update?: boolean }) {
    const body = new FormData();
    body.set('file', theFile);
    if (opts.mapping) body.set('mapping', JSON.stringify(opts.mapping));
    body.set('commit', opts.commit ? 'true' : 'false');
    body.set('updateExisting', (opts.update ?? updateExisting) ? 'true' : 'false');
    body.set(
      'defaults',
      JSON.stringify({
        industry: defaults.industry.trim() || null,
        location: defaults.location.trim() || null,
        source: defaults.source || null,
        ownerUserId: defaults.ownerUserId ? Number(defaults.ownerUserId) : null,
      }),
    );

    const res = await fetch(`/api/leadgen/campaigns/${campaignId}/import`, { method: 'POST', body });
    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;
    if (!res.ok) throw { message: payload?.error ?? `Request failed (${res.status})`, status: res.status };
    return payload as PreviewResponse;
  }

  async function run(theFile: File, opts: { mapping?: Record<number, ImportField>; commit?: boolean; update?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const result = await post(theFile, opts);
      setPreview(result);
      setMapping(result.mapping);
      if (result.committed) {
        setDone({ prospects: result.prospectsCreated ?? 0, contacts: result.contactsCreated ?? 0 });
        router.refresh();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function onPick(picked: File | null) {
    reset();
    setFile(picked);
    if (picked) void run(picked, {});
  }

  function remap(column: number, field: string) {
    const next: Record<number, ImportField> = { ...mapping };
    // A field belongs to one column: assigning it here takes it off the other.
    for (const [k, v] of Object.entries(next)) {
      if (v === field) delete next[Number(k)];
    }
    if (field) next[column] = field as ImportField;
    else delete next[column];
    setMapping(next);
    if (file) void run(file, { mapping: next });
  }

  const counts = preview?.plan.counts;
  const mappedFields = new Set(Object.values(mapping));
  const missingRequired = ['companyName', 'contactName'].filter((f) => !mappedFields.has(f as ImportField));
  const attention = (preview?.plan.companies ?? []).flatMap((c) =>
    c.contacts.filter((x) => x.action !== 'create').map((x) => ({ ...x, company: c.companyName })),
  );

  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Import contacts
      </button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Import contacts"
        description="A CSV where each row is one person. Rows are grouped into prospects by company."
        wide
      >
        {error && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}

        {done ? (
          <div className="py-6 text-center">
            <Check className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            <p className="mt-2 text-sm text-ink">
              Added {done.prospects} {done.prospects === 1 ? 'prospect' : 'prospects'} and {done.contacts}{' '}
              {done.contacts === 1 ? 'contact' : 'contacts'} to this campaign.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button className="btn-ghost" onClick={reset}>
                Import another file
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line bg-surface2 px-4 py-5 hover:border-brand">
                <FileUp className="h-5 w-5 text-ink3" />
                <span className="text-sm text-ink2">
                  {file ? file.name : 'Choose a CSV file — Excel’s Save As → CSV'}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {busy && <p className="text-sm text-ink3">Reading…</p>}

            {preview && (
              <>
                <div>
                  <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-ink3">Columns</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {preview.headers.map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-1/2 truncate text-xs text-ink2" title={h}>
                          {h || `Column ${i + 1}`}
                        </span>
                        <select
                          className="input w-1/2 text-xs"
                          value={mapping[i] ?? ''}
                          onChange={(e) => remap(i, e.target.value)}
                        >
                          <option value="">— not imported —</option>
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {IMPORT_FIELD_LABELS[f]}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  {missingRequired.length > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Map a column to{' '}
                      {missingRequired.map((f) => IMPORT_FIELD_LABELS[f as ImportField]).join(' and ')} before importing.
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-ink3">
                    Applied to every row
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Industry" hint="No sheet carries one">
                      <input
                        className="input"
                        placeholder="e.g. Real Estate"
                        value={defaults.industry}
                        onChange={(e) => setDefaults({ ...defaults, industry: e.target.value })}
                      />
                    </Field>
                    <Field label="Location" hint="Used where a row has none">
                      <input
                        className="input"
                        placeholder="e.g. United Arab Emirates"
                        value={defaults.location}
                        onChange={(e) => setDefaults({ ...defaults, location: e.target.value })}
                      />
                    </Field>
                    <Field label="Source">
                      <select
                        className="input"
                        value={defaults.source}
                        onChange={(e) => setDefaults({ ...defaults, source: e.target.value })}
                      >
                        {PROSPECT_SOURCES.map((s) => (
                          <option key={s} value={s}>
                            {SOURCE_LABELS[s] ?? s}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Owner" hint="Where the sheet names nobody">
                      <select
                        className="input"
                        value={defaults.ownerUserId}
                        onChange={(e) => setDefaults({ ...defaults, ownerUserId: e.target.value })}
                      >
                        <option value="">Unassigned</option>
                        {owners.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-xs text-ink2">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-line accent-[rgb(var(--accent))]"
                      checked={updateExisting}
                      onChange={(e) => {
                        setUpdateExisting(e.target.checked);
                        if (file) void run(file, { mapping, update: e.target.checked });
                      }}
                    />
                    <span>Add contacts that are already on the prospect again. Off by default.</span>
                  </label>
                </div>

                {counts && (
                  <div className="rounded-md border border-line bg-surface2 px-4 py-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                      <Count label="Rows read" value={counts.rows} />
                      <Count label="New prospects" value={counts.companiesCreated} />
                      <Count label="Existing matched" value={counts.companiesMatched} />
                      <Count label="Contacts added" value={counts.contactsCreated} />
                      <Count label="Skipped" value={counts.contactsSkipped} />
                      <Count label="Failed" value={counts.rowsFailed} tone={counts.rowsFailed > 0 ? 'rose' : undefined} />
                    </div>
                  </div>
                )}

                {attention.length > 0 && (
                  <div>
                    <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-ink3">
                      Rows not being added ({attention.length})
                    </div>
                    <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-line p-2 text-xs">
                      {attention.slice(0, 200).map((a) => (
                        <li key={a.rowNumber} className="flex items-baseline gap-2">
                          <Badge tone={a.action === 'error' ? 'rose' : 'neutral'}>Row {a.rowNumber}</Badge>
                          <span className="text-ink2">
                            {a.name || '(no name)'} · {a.company} — {a.reason}
                          </span>
                        </li>
                      ))}
                      {attention.length > 200 && (
                        <li className="text-ink3">…and {attention.length - 200} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button
                className="btn-ghost"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={busy || !file || !preview || missingRequired.length > 0 || (counts?.contactsCreated ?? 0) === 0}
                onClick={() => file && void run(file, { mapping, commit: true })}
              >
                {busy
                  ? 'Working…'
                  : counts
                    ? `Import ${counts.contactsCreated} contact${counts.contactsCreated === 1 ? '' : 's'}`
                    : 'Import'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: 'rose' }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink3">{label}</span>
      <span className={`tnum font-medium ${tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  );
}
