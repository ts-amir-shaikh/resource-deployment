'use client';

import { useState } from 'react';
import { Send, CheckCircle2, Briefcase } from 'lucide-react';
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

export default function ShareClient({
  token,
  requirement: r,
  closed,
}: {
  token: string;
  requirement: Requirement;
  closed: boolean;
}) {
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/share/${token}`, {
        method: 'POST',
        json: { author, body, isFollowup: false },
      });
      setSent(true);
      setBody('');
    } catch (e) {
      if (isApiError(e) && e.fields) {
        setError(Object.values(e.fields)[0] ?? errorMessage(e));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

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
            Share a profile suggestion below and it will reach the hiring team directly.
          </p>

          {sent ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>Thanks — your suggestion has been sent.</strong>
                <button
                  onClick={() => setSent(false)}
                  className="mt-1 block text-xs font-medium underline"
                >
                  Suggest another profile
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {error && (
                <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
              )}
              <Field label="Your name" required>
                <input
                  className="input"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </Field>
              <Field label="Your suggestion" required>
                <textarea
                  className="input min-h-28 resize-y"
                  placeholder="Candidate name, experience, current company, notice period, and how to reach them…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </Field>
              <button
                className="btn-primary"
                onClick={submit}
                disabled={busy || !author.trim() || !body.trim()}
              >
                <Send className="h-4 w-4" />
                {busy ? 'Sending…' : 'Send suggestion'}
              </button>
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
