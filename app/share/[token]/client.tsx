'use client';

import { useState } from 'react';
import { Send, CheckCircle2, Briefcase, UserPlus, MessageSquare } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import {
  formatExperience,
  parseSkills,
  WORK_MODE_LABELS,
  ENGAGEMENT_LABELS,
} from '@/lib/utils';
import { Badge, Field } from '@/components/ui';

type Requirement = {
  title: string;
  companyName: string;
  experienceMin: number | null;
  experienceMax: number | null;
  primarySkill: string | null;
  secondarySkill: string | null;
  otherSkills: string;
  workMode: string | null;
  location: string | null;
  timezone: string | null;
  engagementType: string | null;
  requiredCount: number;
  jdContent: string | null;
  workingDays: string | null;
  workingHours: string | null;
};

const BLANK_REFERRAL = {
  referrerName: '',
  referrerEmail: '',
  referrerMobile: '',
  candidateName: '',
  candidateEmail: '',
  candidateMobile: '',
  experienceYears: '',
  noticePeriodDays: '',
  currentCtc: '',
  expectedCtc: '',
  notes: '',
};

export default function ShareClient({
  token,
  requirement: r,
  closed,
}: {
  token: string;
  requirement: Requirement;
  closed: boolean;
}) {
  const [mode, setMode] = useState<'refer' | 'note'>('refer');
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState<'refer' | 'note' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [referral, setReferral] = useState({ ...BLANK_REFERRAL });

  function reportError(e: unknown) {
    if (isApiError(e) && e.fields) {
      setFieldErrors(e.fields);
      setError(Object.values(e.fields)[0] ?? errorMessage(e));
    } else {
      setError(errorMessage(e));
    }
  }

  async function submitNote() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api(`/api/share/${token}`, {
        method: 'POST',
        json: { author, body, isFollowup: false },
      });
      setSent('note');
      setBody('');
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function submitReferral() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api(`/api/share/${token}/refer`, { method: 'POST', json: referral });
      setSent('refer');
      // The referrer's own details are kept, so recommending a second person
      // does not mean re-typing who you are.
      setReferral((f) => ({
        ...BLANK_REFERRAL,
        referrerName: f.referrerName,
        referrerEmail: f.referrerEmail,
        referrerMobile: f.referrerMobile,
      }));
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  const canSubmitReferral =
    referral.referrerName.trim() !== '' &&
    (referral.referrerEmail.trim() !== '' || referral.referrerMobile.trim() !== '') &&
    referral.candidateName.trim() !== '' &&
    (referral.candidateEmail.trim() !== '' || referral.candidateMobile.trim() !== '');

  const skills = parseSkills(r.otherSkills);

  const facts = [
    ['Experience', formatExperience(r.experienceMin, r.experienceMax)],
    ['Positions', String(r.requiredCount)],
    ['Work Mode', r.workMode ? WORK_MODE_LABELS[r.workMode] : '—'],
    ['Location', r.location ?? '—'],
    ['Timezone', r.timezone ?? '—'],
    ['Engagement', r.engagementType ? ENGAGEMENT_LABELS[r.engagementType] : '—'],
    ['Working Days', r.workingDays ?? '—'],
    ['Working Hours', r.workingHours ?? '—'],
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <header className="border-b border-line pb-6">
        <div className="mb-4 flex items-center gap-2 text-xs font-medium text-ink3">
          <Briefcase className="h-4 w-4" />
          Techstalwarts · Open Requirement
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{r.title}</h1>
        <p className="mt-1 text-sm text-ink2">{r.companyName}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.primarySkill && <Badge tone="blue">{r.primarySkill}</Badge>}
          {r.secondarySkill && <Badge tone="violet">{r.secondarySkill}</Badge>}
          {skills.map((s) => (
            <Badge key={s} tone="neutral">
              {s}
            </Badge>
          ))}
        </div>

        {closed && (
          <div className="mt-4 rounded-md border border-line bg-surface2 px-3 py-2 text-sm text-ink2">
            This requirement has been closed and is no longer accepting suggestions.
          </div>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-line py-6 sm:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-2xs font-medium uppercase tracking-wider text-ink3">
              {k}
            </dt>
            <dd className="mt-0.5 text-sm text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {r.jdContent && (
        <section className="border-b border-line py-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">Job Description</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink2">
            {r.jdContent}
          </p>
        </section>
      )}

      {!closed && (
        <section className="py-6">
          <h2 className="text-sm font-semibold text-ink">Know someone who fits?</h2>
          <p className="mt-1 text-sm text-ink2">
            Recommend a candidate and it reaches the hiring team directly. We will
            contact you on the details you leave below.
          </p>

          <div className="mt-4 flex rounded-md border border-line bg-surface p-0.5">
            {(
              [
                ['refer', 'Recommend a candidate', UserPlus],
                ['note', 'Leave a note', MessageSquare],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setSent(null);
                  setError(null);
                  setFieldErrors({});
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === value ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {sent === mode ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>
                  {mode === 'refer'
                    ? 'Thanks — the profile has reached the hiring team.'
                    : 'Thanks — your note has been sent.'}
                </strong>
                <button
                  onClick={() => setSent(null)}
                  className="mt-1 block text-xs font-medium underline"
                >
                  {mode === 'refer' ? 'Recommend another candidate' : 'Add another note'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {error && (
                <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              )}

              {mode === 'note' ? (
                <>
                  <Field label="Your name" required>
                    <input
                      className="input"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                    />
                  </Field>
                  <Field label="Your note" required>
                    <textarea
                      className="input min-h-28 resize-y"
                      placeholder="A question about the role, or anything else the hiring team should know…"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                    />
                  </Field>
                  <button
                    className="btn-primary"
                    onClick={submitNote}
                    disabled={busy || !author.trim() || !body.trim()}
                  >
                    <Send className="h-4 w-4" />
                    {busy ? 'Sending…' : 'Send note'}
                  </button>
                </>
              ) : (
                <>
                  <fieldset className="rounded-md border border-line p-3">
                    <legend className="px-1 text-2xs font-medium uppercase tracking-wider text-ink3">
                      About you
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Your name" required error={fieldErrors.referrerName}>
                        <input
                          className="input"
                          value={referral.referrerName}
                          onChange={(e) =>
                            setReferral({ ...referral, referrerName: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Your email" error={fieldErrors.referrerEmail}>
                        <input
                          className="input"
                          type="email"
                          value={referral.referrerEmail}
                          onChange={(e) =>
                            setReferral({ ...referral, referrerEmail: e.target.value })
                          }
                        />
                      </Field>
                      <Field
                        label="Your mobile"
                        error={fieldErrors.referrerMobile}
                        hint="Email or mobile — at least one"
                      >
                        <input
                          className="input"
                          value={referral.referrerMobile}
                          onChange={(e) =>
                            setReferral({ ...referral, referrerMobile: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                  </fieldset>

                  <fieldset className="rounded-md border border-line p-3">
                    <legend className="px-1 text-2xs font-medium uppercase tracking-wider text-ink3">
                      The candidate
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field
                        label="Candidate name"
                        required
                        error={fieldErrors.candidateName}
                      >
                        <input
                          className="input"
                          value={referral.candidateName}
                          onChange={(e) =>
                            setReferral({ ...referral, candidateName: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Candidate email" error={fieldErrors.candidateEmail}>
                        <input
                          className="input"
                          type="email"
                          value={referral.candidateEmail}
                          onChange={(e) =>
                            setReferral({ ...referral, candidateEmail: e.target.value })
                          }
                        />
                      </Field>
                      <Field
                        label="Candidate mobile"
                        error={fieldErrors.candidateMobile}
                        hint="Email or mobile — at least one"
                      >
                        <input
                          className="input"
                          value={referral.candidateMobile}
                          onChange={(e) =>
                            setReferral({ ...referral, candidateMobile: e.target.value })
                          }
                        />
                      </Field>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <Field label="Experience (yrs)" error={fieldErrors.experienceYears}>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step="0.5"
                          value={referral.experienceYears}
                          onChange={(e) =>
                            setReferral({ ...referral, experienceYears: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Notice (days)" error={fieldErrors.noticePeriodDays}>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={referral.noticePeriodDays}
                          onChange={(e) =>
                            setReferral({ ...referral, noticePeriodDays: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Current CTC (₹)" error={fieldErrors.currentCtc}>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={referral.currentCtc}
                          onChange={(e) =>
                            setReferral({ ...referral, currentCtc: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Expected CTC (₹)" error={fieldErrors.expectedCtc}>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={referral.expectedCtc}
                          onChange={(e) =>
                            setReferral({ ...referral, expectedCtc: e.target.value })
                          }
                        />
                      </Field>
                    </div>

                    <div className="mt-3">
                      <Field label="Anything else" error={fieldErrors.notes}>
                        <textarea
                          className="input min-h-20 resize-y"
                          placeholder="Current company, why they fit, availability…"
                          value={referral.notes}
                          onChange={(e) =>
                            setReferral({ ...referral, notes: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                  </fieldset>

                  <button
                    className="btn-primary"
                    onClick={submitReferral}
                    disabled={busy || !canSubmitReferral}
                  >
                    <Send className="h-4 w-4" />
                    {busy ? 'Sending…' : 'Send recommendation'}
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <footer className="border-t border-line pt-6 text-2xs text-ink3">
        This page was shared with you by Techstalwarts. Please do not forward the link —
        anyone holding it can view this requirement.
      </footer>
    </div>
  );
}
