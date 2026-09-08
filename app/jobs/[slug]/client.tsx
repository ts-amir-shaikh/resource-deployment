'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Briefcase, CheckCircle2, Send } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import type { PublicJob } from '@/lib/jobs';
import { postedAgo } from '@/lib/jobs';
import {
  formatExperience,
  parseSkills,
  WORK_MODE_LABELS,
  ENGAGEMENT_LABELS,
} from '@/lib/utils';
import { Badge, Field } from '@/components/ui';

const BLANK = {
  candidateName: '',
  referrerName: '',
  referrerEmail: '',
  candidateEmail: '',
  candidateMobile: '',
  experienceYears: '',
  noticePeriodDays: '',
  currentCtc: '',
  expectedCtc: '',
  notes: '',
};

export default function JobDetailClient({ job }: { job: PublicJob }) {
  const [form, setForm] = useState({ ...BLANK });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const skills = parseSkills(job.otherSkills);

  const canSubmit =
    form.candidateName.trim() !== '' &&
    (form.candidateEmail.trim() !== '' || form.candidateMobile.trim() !== '');

  async function apply() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api(`/api/jobs/${job.id}-${job.slug}/apply`, { method: 'POST', json: form });
      setSent(true);
      setForm({ ...BLANK });
    } catch (e) {
      if (isApiError(e) && e.fields) {
        setFieldErrors(e.fields);
        setError(Object.values(e.fields)[0] ?? errorMessage(e));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const facts: [string, string][] = [
    ['Experience', formatExperience(job.experienceMin, job.experienceMax)],
    ['Openings', String(job.openings)],
    ['Work Mode', job.workMode ? (WORK_MODE_LABELS[job.workMode] ?? job.workMode) : '—'],
    ['Location', job.location ?? '—'],
    [
      'Engagement',
      job.engagementType
        ? (ENGAGEMENT_LABELS[job.engagementType] ?? job.engagementType)
        : '—',
    ],
    ['Timezone', job.timezone ?? '—'],
    ['Working Days', job.workingDays ?? '—'],
    ['Working Hours', job.workingHours ?? '—'],
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <Link
        href="/jobs"
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-ink3 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All open roles
      </Link>

      <header className="border-b border-line pb-6">
        <div className="mb-4 flex items-center gap-2 text-xs font-medium text-ink3">
          <Briefcase className="h-4 w-4" />
          Techstalwarts · Open Role
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{job.title}</h1>
        <p className="mt-1 text-sm text-ink2">
          {job.company} · {postedAgo(job.postedAt)}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.primarySkill && <Badge tone="blue">{job.primarySkill}</Badge>}
          {job.secondarySkill && <Badge tone="violet">{job.secondarySkill}</Badge>}
          {skills.map((s) => (
            <Badge key={s} tone="neutral">
              {s}
            </Badge>
          ))}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-line py-6 sm:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-2xs font-medium uppercase tracking-wider text-ink3">{k}</dt>
            <dd className="mt-0.5 text-sm text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {job.jdContent && (
        <section className="border-b border-line py-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">About the role</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink2">
            {job.jdContent}
          </p>
        </section>
      )}

      <section className="py-6">
        <h2 className="text-sm font-semibold text-ink">Apply for this role</h2>
        <p className="mt-1 text-sm text-ink2">
          Leave your details and our team will get in touch. Email or mobile — at
          least one so we can reach you.
        </p>

        {sent ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Thanks — your application has reached our team.</strong>
              <div className="mt-1 text-xs">
                We review every application and will be in touch if there is a fit.
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Your name" required error={fieldErrors.candidateName}>
                <input
                  className="input"
                  value={form.candidateName}
                  onChange={(e) => setForm({ ...form, candidateName: e.target.value })}
                />
              </Field>
              <Field label="Email" error={fieldErrors.candidateEmail}>
                <input
                  className="input"
                  type="email"
                  value={form.candidateEmail}
                  onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })}
                />
              </Field>
              <Field label="Mobile" error={fieldErrors.candidateMobile}>
                <input
                  className="input"
                  value={form.candidateMobile}
                  onChange={(e) => setForm({ ...form, candidateMobile: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Experience (yrs)" error={fieldErrors.experienceYears}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.experienceYears}
                  onChange={(e) => setForm({ ...form, experienceYears: e.target.value })}
                />
              </Field>
              <Field label="Notice (days)" error={fieldErrors.noticePeriodDays}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.noticePeriodDays}
                  onChange={(e) => setForm({ ...form, noticePeriodDays: e.target.value })}
                />
              </Field>
              <Field label="Current CTC (₹)" error={fieldErrors.currentCtc}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.currentCtc}
                  onChange={(e) => setForm({ ...form, currentCtc: e.target.value })}
                />
              </Field>
              <Field label="Expected CTC (₹)" error={fieldErrors.expectedCtc}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.expectedCtc}
                  onChange={(e) => setForm({ ...form, expectedCtc: e.target.value })}
                />
              </Field>
            </div>

            <fieldset className="rounded-md border border-line p-3">
              <legend className="px-1 text-2xs font-medium uppercase tracking-wider text-ink3">
                Referred by someone at Techstalwarts? — optional
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Their name" error={fieldErrors.referrerName}>
                  <input
                    className="input"
                    value={form.referrerName}
                    onChange={(e) => setForm({ ...form, referrerName: e.target.value })}
                  />
                </Field>
                <Field
                  label="Their email"
                  error={fieldErrors.referrerEmail}
                  hint="Helps us credit the right person"
                >
                  <input
                    className="input"
                    type="email"
                    value={form.referrerEmail}
                    onChange={(e) => setForm({ ...form, referrerEmail: e.target.value })}
                  />
                </Field>
              </div>
            </fieldset>

            <Field label="Anything else" error={fieldErrors.notes}>
              <textarea
                className="input min-h-20 resize-y"
                placeholder="Current company, relevant projects, availability…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>

            <button className="btn-primary" onClick={apply} disabled={busy || !canSubmit}>
              <Send className="h-4 w-4" />
              {busy ? 'Sending…' : 'Submit application'}
            </button>
          </div>
        )}
      </section>

      <footer className="border-t border-line pt-6 text-2xs text-ink3">
        Techstalwarts · We only use these details to consider you for this role.
      </footer>
    </div>
  );
}
