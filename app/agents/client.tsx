'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles, FileText, Calculator, ClipboardCheck, FileEdit, MessageSquareQuote,
  Upload, X, Play, AlertTriangle, Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import type { Role } from '@/lib/auth';
import { Badge, PageHeader, Field, EmptyState } from '@/components/ui';

type AgentKind =
  | 'jd_evaluator'
  | 'budgeting'
  | 'resume_validation'
  | 'resume_formatting'
  | 'interview_questions';

type Run = {
  id: number; agent: string; status: string; title: string; userName: string;
  output: string | null; error: string | null; model: string | null;
  costUsd: number; inputTokens: number; outputTokens: number;
  opportunityId: number | null; createdAt: string;
};
type Requirement = { id: number; title: string; companyName: string };
type Cap = { cap: number; spent: number; blocked: boolean };

/**
 * `retired` keeps an agent's label for the run history while removing it from
 * the picker. The list is not the gate — /api/agents/run refuses a retired
 * kind whatever the form sends.
 */
const AGENTS: {
  kind: AgentKind; label: string; blurb: string; icon: LucideIcon;
  needsResume: boolean; needsJd: boolean; model: string; retired?: boolean;
}[] = [
  {
    kind: 'interview_questions', label: 'Interview Questions', icon: MessageSquareQuote, model: 'Opus',
    needsResume: false, needsJd: true,
    blurb: 'A question set grouped by the rating pointers the candidate will be scored against, with the signals to listen for in a strong answer.',
  },
  {
    kind: 'jd_evaluator', label: 'JD Evaluator', icon: FileText, model: 'Sonnet',
    needsResume: false, needsJd: true, retired: true,
    blurb: 'Structures a job description, separates mandatory from preferred, and flags what is missing or unrealistic.',
  },
  {
    kind: 'budgeting', label: 'Budgeting', icon: Calculator, model: 'Opus',
    needsResume: false, needsJd: false, retired: true,
    blurb: 'Hiring budget and client billing rate, with the employer-cost build-up shown rather than asserted.',
  },
  {
    kind: 'resume_validation', label: 'Resume Validation', icon: ClipboardCheck, model: 'Opus',
    needsResume: true, needsJd: true,
    blurb: 'Scores a resume against a JD out of 100 with evidence, gaps, validation points and a confidence level.',
  },
  {
    kind: 'resume_formatting', label: 'Resume Formatting', icon: FileEdit, model: 'Sonnet',
    needsResume: true, needsJd: false,
    blurb: 'Reformats a resume to a template without inventing content, bracketing what the source does not support.',
  },
];

const AGENT_LABEL: Record<string, string> = Object.fromEntries(
  AGENTS.map((a) => [a.kind, a.label]),
);

export default function AgentsClient({
  role, configured, runs, requirements, cap,
}: {
  role: Role; configured: boolean; runs: Run[]; requirements: Requirement[]; cap: Cap;
}) {
  const router = useRouter();
  const canRun = role !== 'management';
  const visibleAgents = useMemo(() => AGENTS.filter((a) => !a.retired), []);

  const [active, setActive] = useState<AgentKind | null>(null);
  const [form, setForm] = useState({
    title: '', jd: '', roleDetails: '', referenceTemplate: '', resumeText: '',
    notes: '', opportunityId: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Run | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const agent = visibleAgents.find((a) => a.kind === active) ?? null;

  function open(kind: AgentKind) {
    setActive(kind);
    setForm({ title: '', jd: '', roleDetails: '', referenceTemplate: '', resumeText: '', notes: '', opportunityId: '' });
    setFiles([]);
    setError(null);
    setResult(null);
  }

  async function run() {
    if (!agent) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('agent', agent.kind);
      for (const [k, v] of Object.entries(form)) if (v) body.set(k, v);
      for (const f of files) body.append('files', f);

      const res = await fetch('/api/agents/run', { method: 'POST', body });
      const text = await res.text();
      const payload = text ? JSON.parse(text) : null;
      if (!res.ok) throw { message: payload?.error ?? 'The run failed', status: res.status, fields: payload?.fields };

      setResult({
        id: payload.id, agent: agent.kind, status: 'complete', title: form.title || agent.label,
        userName: '', output: payload.output, error: null, model: payload.model,
        costUsd: payload.costUsd, inputTokens: payload.inputTokens, outputTokens: payload.outputTokens,
        opportunityId: form.opportunityId ? Number(form.opportunityId) : null,
        createdAt: new Date().toISOString(),
      });
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setError(Object.values(e.fields)[0] ?? errorMessage(e));
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    agent !== null &&
    (!agent.needsResume || files.length > 0 || form.resumeText.trim() !== '') &&
    (!agent.needsJd || form.jd.trim() !== '' || form.opportunityId !== '') &&
    (agent.kind !== 'budgeting' || form.roleDetails.trim() !== '' || form.jd.trim() !== '' || form.opportunityId !== '');

  return (
    <div className="pb-12">
      <PageHeader
        title="Agents"
        subtitle="Evidence-based analysis run against your own requirements and resumes"
      />

      <div className="space-y-6 px-6 py-4">
        {!configured && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Agents are not configured yet.</strong> An{' '}
              <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> must be set in
              the deployment environment before any agent can run. Everything below is
              ready and will work the moment it is.
            </div>
          </div>
        )}

        {cap.cap > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface2 px-4 py-2.5 text-xs">
            <span className="text-ink2">
              Agent spend this month:{' '}
              <strong className="tnum text-ink">${cap.spent.toFixed(2)}</strong> of $
              {cap.cap.toFixed(2)}
            </span>
            {cap.blocked && (
              <Badge tone="rose">cap reached — runs paused</Badge>
            )}
          </div>
        )}

        {/* Agent picker */}
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleAgents.map((a) => {
            const Icon = a.icon;
            const on = active === a.kind;
            return (
              <button
                key={a.kind}
                onClick={() => open(a.kind)}
                disabled={!canRun}
                className={`card p-4 text-left transition-colors disabled:opacity-60 ${
                  on ? 'border-brand ring-1 ring-brand/30' : 'hover:border-brand/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 rounded-md p-1.5 ${on ? 'bg-brand text-white' : 'bg-surface2 text-ink2'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{a.label}</span>
                      <Badge tone="neutral">{a.model}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink2">{a.blurb}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {!canRun && (
          <p className="text-xs text-ink3">
            Management access is view-only — past runs are readable below, but starting a
            new one is disabled.
          </p>
        )}

        {/* Run form */}
        {agent && canRun && (
          <section className="card">
            <header className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Run {agent.label}</h2>
            </header>

            <div className="space-y-3 p-4">
              {error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                  {error}
                </div>
              )}

              <Field label="Label for this run" hint="Optional — helps find it later">
                <input
                  className="input"
                  placeholder={`${agent.label} · ${new Date().toISOString().slice(0, 10)}`}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>

              {(agent.needsJd || agent.kind === 'budgeting') && (
                <>
                  <Field
                    label="Use a requirement from the pipeline"
                    hint="Pulls its JD and details — no need to paste what the system already holds"
                  >
                    <select
                      className="input"
                      value={form.opportunityId}
                      onChange={(e) => setForm({ ...form, opportunityId: e.target.value })}
                    >
                      <option value="">Not linked — I will paste the JD</option>
                      {requirements.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} · {r.companyName}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {!form.opportunityId && (
                    <Field label="Job description" required={agent.needsJd}>
                      <textarea
                        className="input min-h-32 resize-y"
                        placeholder="Paste the JD, including any clarifications the client gave…"
                        value={form.jd}
                        onChange={(e) => setForm({ ...form, jd: e.target.value })}
                      />
                    </Field>
                  )}
                </>
              )}

              {agent.kind === 'budgeting' && (
                <Field
                  label="Role and commercial details"
                  hint="Experience, city, work model, contract length, expected margin, payroll and statutory model. Missing inputs produce labelled scenarios instead of one invented figure."
                >
                  <textarea
                    className="input min-h-28 resize-y"
                    placeholder={
                      'e.g. 5–7 yrs .NET + Angular, Mumbai onsite, 6-month contract,\n' +
                      'target gross margin 22%, statutory ~12% employer PF + gratuity…'
                    }
                    value={form.roleDetails}
                    onChange={(e) => setForm({ ...form, roleDetails: e.target.value })}
                  />
                </Field>
              )}

              {agent.needsResume && (
                <>
                  <Field
                    label="Resume"
                    required
                    hint="PDF keeps the layout the model reads best. DOCX and TXT are converted to text first, which loses some structure."
                  >
                    <div className="space-y-2">
                      <input
                        ref={fileInput}
                        type="file"
                        multiple
                        accept=".pdf,.docx,.txt,.md"
                        className="hidden"
                        onChange={(e) => {
                          setFiles([...files, ...Array.from(e.target.files ?? [])]);
                          if (fileInput.current) fileInput.current.value = '';
                        }}
                      />
                      <button
                        type="button"
                        className="btn-ghost w-full"
                        onClick={() => fileInput.current?.click()}
                      >
                        <Upload className="h-4 w-4" /> Attach resume
                      </button>
                      {files.map((f, i) => (
                        <div
                          key={`${f.name}-${i}`}
                          className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface2 px-3 py-1.5 text-xs"
                        >
                          <span className="truncate text-ink2">
                            {f.name} · {(f.size / 1024).toFixed(0)}KB
                          </span>
                          <button
                            type="button"
                            onClick={() => setFiles(files.filter((_, x) => x !== i))}
                            className="shrink-0 text-ink3 hover:text-rose-600"
                            aria-label={`Remove ${f.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </Field>

                  <Field label="…or paste the resume text" hint="If you would rather not upload a file">
                    <textarea
                      className="input min-h-24 resize-y"
                      value={form.resumeText}
                      onChange={(e) => setForm({ ...form, resumeText: e.target.value })}
                    />
                  </Field>
                </>
              )}

              {agent.kind === 'resume_formatting' && (
                <Field
                  label="Reference template"
                  hint="Structure only — the agent never copies the reference candidate's facts"
                >
                  <textarea
                    className="input min-h-24 resize-y"
                    placeholder="Paste the client's reference resume, or describe the required structure…"
                    value={form.referenceTemplate}
                    onChange={(e) => setForm({ ...form, referenceTemplate: e.target.value })}
                  />
                </Field>
              )}

              <Field label="Anything else the agent should know" hint="Optional">
                <textarea
                  className="input min-h-20 resize-y"
                  placeholder="Client feedback gates, non-negotiables, prior context…"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>

              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-2xs text-ink3">
                  Uploaded files are sent for analysis and not stored. Only the result is kept.
                </p>
                <button
                  className="btn-primary shrink-0"
                  onClick={run}
                  disabled={busy || !canSubmit || !configured || cap.blocked}
                >
                  {busy ? (
                    <>
                      <Clock className="h-4 w-4 animate-pulse" /> Running…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Run agent
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Latest result */}
        {result?.output && (
          <section className="card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Sparkles className="h-4 w-4 text-brand" />
                {AGENT_LABEL[result.agent]} result
              </h2>
              <span className="tnum text-2xs text-ink3">
                {result.model} · {result.inputTokens.toLocaleString()} in /{' '}
                {result.outputTokens.toLocaleString()} out · ${result.costUsd.toFixed(3)}
              </span>
            </header>
            <div className="max-h-[36rem] overflow-y-auto px-4 py-3">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink2">
                {result.output}
              </pre>
            </div>
          </section>
        )}

        {/* History */}
        <section className="card">
          <header className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">
              Recent runs
              <span className="ml-1.5 font-normal text-ink3">{runs.length}</span>
            </h2>
          </header>
          {runs.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No runs yet"
              description="Pick an agent above to run your first analysis."
            />
          ) : (
            <ul className="divide-y divide-line">
              {runs.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-ink">{r.title}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-ink3">
                        <Badge tone="neutral">{AGENT_LABEL[r.agent] ?? r.agent}</Badge>
                        {r.status === 'failed' && <Badge tone="rose">failed</Badge>}
                        {r.status === 'running' && <Badge tone="amber">running</Badge>}
                        <span>{r.userName}</span>
                        <span>· {formatDate(r.createdAt.slice(0, 10))}</span>
                        {r.opportunityId && (
                          <Link
                            href={`/pipeline/${r.opportunityId}`}
                            className="text-brand hover:underline"
                          >
                            · requirement #{r.opportunityId}
                          </Link>
                        )}
                      </div>
                    </div>
                    <span className="tnum shrink-0 text-2xs text-ink3">
                      ${r.costUsd.toFixed(3)}
                    </span>
                  </div>
                  {r.error && (
                    <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{r.error}</p>
                  )}
                  {r.output && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-brand">
                        View result
                      </summary>
                      <pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-surface2 p-3 font-sans text-xs leading-relaxed text-ink2">
                        {r.output}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
