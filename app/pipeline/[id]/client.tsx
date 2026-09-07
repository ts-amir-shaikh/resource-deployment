'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Share2,
  Check,
  MessageSquare,
  History,
  Trash2,
  Pencil,
  Rocket,
  CalendarClock,
  Inbox,
  UserPlus,
  X,
} from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import {
  formatINR,
  formatINRCompact,
  formatDate,
  formatExperience,
  formatBudget,
  parseSkills,
  today,
  STAGE_LABELS,
  ACTIVE_STAGES,
  CANDIDATE_STATUS_LABELS,
  SOURCE_LABELS,
  WORK_MODE_LABELS,
  ENGAGEMENT_LABELS,
} from '@/lib/utils';
import { Modal, Field, Badge, FormSection, TableShell, type Tone } from '@/components/ui';
import type { Role } from '@/lib/auth';

type Opportunity = {
  id: number;
  clientId: number | null;
  companyName: string;
  title: string;
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
  budgetMin: number | null;
  budgetMax: number | null;
  hiringBudgetMin: number | null;
  hiringBudgetMax: number | null;
  jdContent: string | null;
  workingDays: string | null;
  workingHours: string | null;
  stage: string;
  priority: string | null;
  owner: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  closedReason: string | null;
  shareToken: string;
  convertedProjectId: number | null;
  clientName: string | null;
  isProspect: boolean;
  followUpDue: boolean;
};

type Mapped = {
  id: number;
  candidateId: number;
  status: string;
  interviewRound: number;
  interviewDate: string | null;
  feedback: string | null;
  expectedBilling: number | null;
  name: string;
  currentDesignation: string | null;
  experienceYears: number | null;
  primarySkill: string | null;
  source: string;
  sourceName: string | null;
  expectedCtc: number | null;
  noticePeriodDays: number | null;
};

type Comment = {
  id: number;
  author: string;
  authorRole: string;
  body: string;
  isFollowup: boolean;
  followUpDate: string | null;
  createdAt: string;
};

type StageEvent = {
  id: number;
  fromStage: string | null;
  toStage: string;
  note: string | null;
  createdAt: string;
};

type Suggestion = {
  id: number;
  referrerName: string;
  referrerEmail: string | null;
  referrerMobile: string | null;
  candidateName: string;
  candidateEmail: string | null;
  candidateMobile: string | null;
  experienceYears: number | null;
  noticePeriodDays: number | null;
  currentCtc: number | null;
  expectedCtc: number | null;
  notes: string | null;
  status: string;
  convertedCandidateId: number | null;
  createdAt: string;
};

type PoolCandidate = {
  id: number;
  name: string;
  currentDesignation: string | null;
  primarySkill: string | null;
  experienceYears: number | null;
  source: string;
  sourceName: string | null;
};

const STAGE_TONE: Record<string, Tone> = {
  requirement: 'neutral',
  qualification: 'blue',
  budgeting: 'violet',
  candidate_mapping: 'amber',
  interview: 'rose',
  agreement: 'blue',
  won: 'green',
  lost: 'neutral',
  hold: 'amber',
};

const STATUS_TONE: Record<string, Tone> = {
  mapped: 'neutral',
  screening: 'blue',
  submitted: 'violet',
  interview: 'amber',
  selected: 'green',
  offered: 'green',
  joined: 'green',
  rejected: 'rose',
  withdrawn: 'neutral',
};

export default function OpportunityDetailClient({
  opportunity: o,
  mapped,
  comments,
  history,
  pool,
  suggestions,
  resumeTo,
  role,
}: {
  opportunity: Opportunity;
  mapped: Mapped[];
  comments: Comment[];
  history: StageEvent[];
  pool: PoolCandidate[];
  suggestions: Suggestion[];
  resumeTo: string;
  role: Role;
}) {
  const router = useRouter();
  // Mirrors the policy middleware enforces, so the UI never offers an action
  // the request would reject.
  const readOnly = role === 'management';
  const canEditRequirement = role === 'admin';
  const showHiringBudget = role === 'ta';

  // Stakeholder replies from the share link are kept in their own thread —
  // mixing outside suggestions into the internal running commentary buries
  // both. Referred profiles are separate again, in the Suggestions inbox.
  const [thread, setThread] = useState<'internal' | 'stakeholder'>('internal');
  const internalComments = comments.filter((c) => c.authorRole !== 'stakeholder');
  const stakeholderComments = comments.filter((c) => c.authorRole === 'stakeholder');
  const shownComments = thread === 'internal' ? internalComments : stakeholderComments;

  const [suggestionBusy, setSuggestionBusy] = useState<number | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const newSuggestions = suggestions.filter((s) => s.status === 'new');

  async function actOnSuggestion(id: number, action: 'accept' | 'dismiss') {
    setSuggestionBusy(id);
    setSuggestionError(null);
    try {
      await api(`/api/referrals/${id}`, {
        method: 'PATCH',
        json: { action, mapToOpportunity: action === 'accept' },
      });
      router.refresh();
    } catch (e) {
      setSuggestionError(errorMessage(e));
    } finally {
      setSuggestionBusy(null);
    }
  }
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [stageOpen, setStageOpen] = useState(false);
  const [stageTarget, setStageTarget] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [stageReason, setStageReason] = useState('');
  const [stageError, setStageError] = useState<string | null>(null);

  const [mapOpen, setMapOpen] = useState(false);
  const [mapForm, setMapForm] = useState({
    candidateId: '',
    status: 'mapped',
    interviewRound: '0',
    interviewDate: '',
    feedback: '',
    expectedBilling: '',
  });
  const [mapError, setMapError] = useState<string | null>(null);
  const [editingMap, setEditingMap] = useState<Mapped | null>(null);

  const [commentBody, setCommentBody] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [isFollowup, setIsFollowup] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({
    projectName: o.title,
    managerName: '',
    managerEmail: '',
    managerMobile: '',
    managerDesignation: '',
    createDeployments: true,
  });
  const [convertError, setConvertError] = useState<string | null>(null);

  const filled = mapped.filter((m) =>
    ['selected', 'offered', 'joined'].includes(m.status),
  ).length;
  const joined = mapped.filter((m) => m.status === 'joined').length;
  const isTerminal = ['won', 'lost'].includes(o.stage);
  const alreadyMapped = new Set(mapped.map((m) => m.candidateId));

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/share/${o.shareToken}`
      : '';

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this share link:', shareUrl);
    }
  }

  async function moveStage() {
    setBusy(true);
    setStageError(null);
    try {
      await api(`/api/opportunities/${o.id}/stage`, {
        method: 'POST',
        json: {
          toStage: stageTarget,
          note: stageNote,
          closedReason: ['lost', 'hold'].includes(stageTarget) ? stageReason : undefined,
        },
      });
      setStageOpen(false);
      setStageNote('');
      setStageReason('');
      router.refresh();
    } catch (e) {
      setStageError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping() {
    setBusy(true);
    setMapError(null);
    try {
      const payload = {
        ...mapForm,
        expectedBilling:
          mapForm.expectedBilling === '' ? undefined : Number(mapForm.expectedBilling),
      };
      if (editingMap) {
        await api(
          `/api/opportunities/${o.id}/candidates?mapping_id=${editingMap.id}`,
          { method: 'PUT', json: payload },
        );
      } else {
        await api(`/api/opportunities/${o.id}/candidates`, {
          method: 'POST',
          json: payload,
        });
      }
      setMapOpen(false);
      setEditingMap(null);
      router.refresh();
    } catch (e) {
      setMapError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeMapping(m: Mapped) {
    if (!confirm(`Remove ${m.name} from this opportunity?`)) return;
    try {
      await api(`/api/opportunities/${o.id}/candidates?mapping_id=${m.id}`, {
        method: 'DELETE',
      });
      router.refresh();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function postComment() {
    setBusy(true);
    setCommentError(null);
    try {
      await api(`/api/opportunities/${o.id}/comments`, {
        method: 'POST',
        json: {
          author: commentAuthor,
          body: commentBody,
          isFollowup,
          followUpDate: isFollowup ? followUpDate : undefined,
        },
      });
      setCommentBody('');
      setIsFollowup(false);
      setFollowUpDate('');
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) {
        setCommentError(Object.values(e.fields)[0] ?? errorMessage(e));
      } else {
        setCommentError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    setBusy(true);
    setConvertError(null);
    try {
      const res = await api<{
        projectId: number;
        createdClient: boolean;
        createdDeployments: number[];
        skipped: { name: string; reason: string }[];
      }>(`/api/opportunities/${o.id}/convert`, { method: 'POST', json: convertForm });

      setConvertOpen(false);
      const bits = [`Project created.`];
      if (res.createdClient) bits.push('Prospect converted to a client.');
      if (res.createdDeployments.length)
        bits.push(`${res.createdDeployments.length} deployment(s) opened.`);
      if (res.skipped.length)
        bits.push(
          `Skipped: ${res.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}.`,
        );
      alert(bits.join(' '));
      router.push(`/projects`);
    } catch (e) {
      setConvertError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function openMapCreate() {
    setEditingMap(null);
    setMapForm({
      candidateId: '',
      status: 'mapped',
      interviewRound: '0',
      interviewDate: '',
      feedback: '',
      expectedBilling: '',
    });
    setMapError(null);
    setMapOpen(true);
  }

  function openMapEdit(m: Mapped) {
    setEditingMap(m);
    setMapForm({
      candidateId: String(m.candidateId),
      status: m.status,
      interviewRound: String(m.interviewRound),
      interviewDate: m.interviewDate ?? '',
      feedback: m.feedback ?? '',
      expectedBilling: m.expectedBilling ? String(m.expectedBilling) : '',
    });
    setMapError(null);
    setMapOpen(true);
  }

  const skills = parseSkills(o.otherSkills);

  return (
    <div className="pb-12">
      {/* Header */}
      <header className="border-b border-line px-6 py-5">
        <Link
          href="/pipeline"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink2 hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to pipeline
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-ink">{o.title}</h1>
              <Badge tone={STAGE_TONE[o.stage]}>{STAGE_LABELS[o.stage]}</Badge>
              {o.priority === 'high' && <Badge tone="rose">High priority</Badge>}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink2">
              <span>{o.companyName}</span>
              {o.isProspect ? (
                <Badge tone="neutral">Prospect</Badge>
              ) : (
                <Badge tone="blue">Client</Badge>
              )}
              {o.owner && <span className="text-ink3">· owned by {o.owner}</span>}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={copyShare}>
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Link copied
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" /> Share link
                </>
              )}
            </button>
            {!o.convertedProjectId && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setStageTarget(o.stage === 'hold' ? resumeTo : '');
                  setStageError(null);
                  setStageOpen(true);
                }}
              >
                Move stage
              </button>
            )}
            {o.stage === 'won' && !o.convertedProjectId && (
              <button className="btn-primary" onClick={() => setConvertOpen(true)}>
                <Rocket className="h-4 w-4" /> Convert to Project
              </button>
            )}
            {o.convertedProjectId && (
              <Link href="/projects" className="btn-ghost">
                View project
              </Link>
            )}
          </div>
        </div>

        {o.closedReason && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <strong>{STAGE_LABELS[o.stage]}:</strong> {o.closedReason}
          </div>
        )}

        {o.nextStep && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              o.followUpDue
                ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'
                : 'border-line bg-surface2 text-ink2'
            }`}
          >
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Next step</strong> ({formatDate(o.nextStepDate)}): {o.nextStep}
            </span>
          </div>
        )}
      </header>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Qualification */}
          <section className="card">
            <header className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Qualification</h2>
            </header>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-3">
              {[
                ['Experience', formatExperience(o.experienceMin, o.experienceMax)],
                ['Positions', `${filled} filled of ${o.requiredCount}`],
                showHiringBudget
                  ? [
                      'Hiring Budget',
                      formatBudget(o.hiringBudgetMin, o.hiringBudgetMax),
                    ]
                  : ['Budget', formatBudget(o.budgetMin, o.budgetMax)],
                ['Work Mode', o.workMode ? WORK_MODE_LABELS[o.workMode] : '—'],
                ['Location', o.location ?? '—'],
                ['Timezone', o.timezone ?? '—'],
                [
                  'Engagement',
                  o.engagementType ? ENGAGEMENT_LABELS[o.engagementType] : '—',
                ],
                ['Working Days', o.workingDays ?? '—'],
                ['Working Hours', o.workingHours ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-2xs font-medium uppercase tracking-wider text-ink3">
                    {k}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-line px-4 py-3">
              <div className="text-2xs font-medium uppercase tracking-wider text-ink3">
                Skills
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {o.primarySkill && <Badge tone="blue">{o.primarySkill}</Badge>}
                {o.secondarySkill && <Badge tone="violet">{o.secondarySkill}</Badge>}
                {skills.map((s) => (
                  <Badge key={s} tone="neutral">
                    {s}
                  </Badge>
                ))}
                {!o.primarySkill && !o.secondarySkill && !skills.length && (
                  <span className="text-sm text-ink3">None recorded</span>
                )}
              </div>
            </div>
          </section>

          {/* JD */}
          {o.jdContent && (
            <section className="card">
              <header className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Job Description</h2>
              </header>
              <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-ink2">
                {o.jdContent}
              </p>
            </section>
          )}

          {/* Candidates */}
          <section className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Candidates</h2>
                <p className="mt-0.5 text-2xs text-ink3">
                  {mapped.length} mapped · {filled} filling a position
                </p>
              </div>
              <button className="btn-ghost" onClick={openMapCreate} disabled={isTerminal}>
                <Plus className="h-3.5 w-3.5" /> Map candidate
              </button>
            </header>

            {mapped.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink3">
                No candidates mapped yet.
              </p>
            ) : (
              <TableShell>
                <thead className="border-b border-line bg-surface2">
                  <tr>
                    <th className="th">Candidate</th>
                    <th className="th">Status</th>
                    <th className="th">Interview</th>
                    <th className="th text-right">Billing</th>
                    <th className="th w-20 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mapped.map((m) => (
                    <tr key={m.id} className="hover:bg-surface2/50">
                      <td className="td">
                        <div className="font-medium text-ink">{m.name}</div>
                        <div className="text-2xs text-ink3">
                          {m.currentDesignation ?? '—'}
                          {m.experienceYears != null && ` · ${m.experienceYears} yrs`}
                        </div>
                        <div className="mt-1">
                          <Badge tone="neutral">
                            {SOURCE_LABELS[m.source]}
                            {m.sourceName ? ` · ${m.sourceName}` : ''}
                          </Badge>
                        </div>
                      </td>
                      <td className="td">
                        <Badge tone={STATUS_TONE[m.status]}>
                          {CANDIDATE_STATUS_LABELS[m.status]}
                        </Badge>
                      </td>
                      <td className="td">
                        {m.interviewRound > 0 ? (
                          <>
                            <div className="text-ink">Round {m.interviewRound}</div>
                            <div className="tnum text-2xs text-ink3">
                              {formatDate(m.interviewDate)}
                            </div>
                          </>
                        ) : (
                          <span className="text-ink3">—</span>
                        )}
                        {m.feedback && (
                          <div className="mt-1 max-w-56 text-2xs italic text-ink3">
                            {m.feedback}
                          </div>
                        )}
                      </td>
                      <td className="td text-right">
                        <span className="tnum text-ink">
                          {formatINR(m.expectedBilling)}
                        </span>
                      </td>
                      <td className="td text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openMapEdit(m)}
                            className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                            aria-label={`Update ${m.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => removeMapping(m)}
                            className="rounded p-1.5 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                            aria-label={`Remove ${m.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Referred profiles awaiting review */}
          <section className="card">
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Inbox className="h-4 w-4 text-ink3" />
              <h2 className="text-sm font-semibold text-ink">
                Suggested Profiles
                {newSuggestions.length > 0 && (
                  <span className="ml-1.5 font-normal text-ink3">
                    {newSuggestions.length} new
                  </span>
                )}
              </h2>
            </header>

            {suggestionError && (
              <p className="border-b border-line px-4 py-2 text-xs text-rose-600 dark:text-rose-400">
                {suggestionError}
              </p>
            )}

            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {suggestions.map((sg) => (
                <li key={sg.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-ink">
                      {sg.candidateName}
                    </span>
                    {sg.status === 'new' && <Badge tone="amber">New</Badge>}
                    {sg.status === 'accepted' && <Badge tone="green">In pool</Badge>}
                    {sg.status === 'dismissed' && (
                      <Badge tone="neutral">Dismissed</Badge>
                    )}
                  </div>

                  <div className="mt-1 text-2xs text-ink3">
                    Referred by {sg.referrerName}
                    {sg.referrerEmail && ` · ${sg.referrerEmail}`}
                    {sg.referrerMobile && ` · ${sg.referrerMobile}`}
                  </div>

                  <div className="mt-1.5 space-y-0.5 text-xs text-ink2">
                    {(sg.candidateEmail || sg.candidateMobile) && (
                      <div className="tnum">
                        {[sg.candidateEmail, sg.candidateMobile]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                    <div className="tnum">
                      {[
                        sg.experienceYears !== null && `${sg.experienceYears} yrs`,
                        sg.noticePeriodDays !== null && `${sg.noticePeriodDays}d notice`,
                        sg.currentCtc !== null && `current ${formatINRCompact(sg.currentCtc)}`,
                        sg.expectedCtc !== null &&
                          `expected ${formatINRCompact(sg.expectedCtc)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </div>
                  </div>

                  {sg.notes && (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-ink2">
                      {sg.notes}
                    </p>
                  )}

                  {sg.status === 'new' && !readOnly && (
                    <div className="mt-2 flex gap-2">
                      <button
                        className="btn px-2 py-1 text-xs"
                        onClick={() => actOnSuggestion(sg.id, 'accept')}
                        disabled={suggestionBusy === sg.id}
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Add to pool
                      </button>
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => actOnSuggestion(sg.id, 'dismiss')}
                        disabled={suggestionBusy === sg.id}
                      >
                        <X className="h-3.5 w-3.5" /> Dismiss
                      </button>
                    </div>
                  )}

                  <div className="tnum mt-1 text-2xs text-ink3">
                    {formatDate(sg.createdAt.slice(0, 10))}
                  </div>
                </li>
              ))}
              {suggestions.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-ink3">
                  Profiles recommended through the share link land here for review
                  before they join the candidate pool.
                </li>
              )}
            </ul>
          </section>

          {/* Comments */}
          <section className="card">
            <header className="border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-ink3" />
                <h2 className="text-sm font-semibold text-ink">
                  Discussion
                  <span className="ml-1.5 font-normal text-ink3">{comments.length}</span>
                </h2>
              </div>
              <div className="mt-2.5 flex rounded-md border border-line bg-surface p-0.5">
                {(
                  [
                    ['internal', 'Team', internalComments.length],
                    ['stakeholder', 'Stakeholder', stakeholderComments.length],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setThread(value)}
                    className={`flex-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      thread === value ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
                    }`}
                  >
                    {label}
                    <span className="ml-1.5 opacity-60">{count}</span>
                  </button>
                ))}
              </div>
            </header>

            {thread === 'stakeholder' ? (
              <p className="border-b border-line px-4 py-2.5 text-2xs text-ink3">
                Notes left by people holding the share link. Reply over email — this
                thread is one-way.
              </p>
            ) : readOnly ? null : (
            <div className="space-y-2 border-b border-line p-3">
              {commentError && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{commentError}</p>
              )}
              <input
                className="input"
                placeholder="Your name"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
              />
              <textarea
                className="input min-h-20 resize-y"
                placeholder="Add an update, or note what happens next…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink2">
                <input
                  type="checkbox"
                  checked={isFollowup}
                  onChange={(e) => setIsFollowup(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-line accent-[rgb(var(--accent))]"
                />
                Mark as the next step
              </label>
              {isFollowup && (
                <input
                  className="input"
                  type="date"
                  min={today()}
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              )}
              <button
                className="btn-primary w-full"
                onClick={postComment}
                disabled={busy || !commentBody.trim() || !commentAuthor.trim()}
              >
                Post
              </button>
            </div>
            )}

            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {shownComments.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-ink">{c.author}</span>
                    {c.authorRole === 'stakeholder' && (
                      <Badge tone="violet">Stakeholder</Badge>
                    )}
                    {c.isFollowup && <Badge tone="amber">Next step</Badge>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink2">
                    {c.body}
                  </p>
                  <div className="tnum mt-1 text-2xs text-ink3">
                    {formatDate(c.createdAt.slice(0, 10))}
                    {c.followUpDate && ` · due ${formatDate(c.followUpDate)}`}
                  </div>
                </li>
              ))}
              {shownComments.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-ink3">
                  {thread === 'stakeholder'
                    ? 'No notes from the share link yet.'
                    : 'No comments yet.'}
                </li>
              )}
            </ul>
          </section>

          {/* Stage history */}
          <section className="card">
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <History className="h-4 w-4 text-ink3" />
              <h2 className="text-sm font-semibold text-ink">Stage History</h2>
            </header>
            <ol className="divide-y divide-line">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-2 px-4 py-2.5">
                  <Badge tone={STAGE_TONE[h.toStage] ?? 'neutral'}>
                    {STAGE_LABELS[h.toStage] ?? h.toStage}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    {h.fromStage && (
                      <div className="text-2xs text-ink3">
                        from {STAGE_LABELS[h.fromStage] ?? h.fromStage}
                      </div>
                    )}
                    {h.note && <div className="text-xs text-ink2">{h.note}</div>}
                    <div className="tnum text-2xs text-ink3">
                      {formatDate(h.createdAt.slice(0, 10))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {/* Move stage */}
      <Modal
        open={stageOpen}
        onClose={() => setStageOpen(false)}
        title="Move Stage"
        description={`Currently at ${STAGE_LABELS[o.stage]}. Stages move in both directions.`}
      >
        {stageError && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {stageError}
          </div>
        )}

        {o.stage === 'hold' && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            This opportunity is on hold. Resuming returns it to{' '}
            <strong>{STAGE_LABELS[resumeTo]}</strong>, where it was parked.
          </div>
        )}

        <Field label="Move to" required>
          <div className="grid grid-cols-2 gap-1.5">
            {[...ACTIVE_STAGES, 'won', 'lost', 'hold'].map((s) => (
              <button
                key={s}
                type="button"
                disabled={s === o.stage}
                onClick={() => setStageTarget(s)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
                  stageTarget === s
                    ? 'border-brand bg-brandbg text-brand'
                    : 'border-line bg-surface text-ink2 hover:bg-surface2'
                }`}
              >
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>
        </Field>

        {['lost', 'hold'].includes(stageTarget) && (
          <div className="mt-4">
            <Field
              label={stageTarget === 'lost' ? 'Why was it lost?' : 'Why is it on hold?'}
              required
            >
              <input
                className="input"
                value={stageReason}
                onChange={(e) => setStageReason(e.target.value)}
                placeholder={
                  stageTarget === 'lost'
                    ? 'e.g. Client went with an internal hire'
                    : 'e.g. Budget approval deferred to next quarter'
                }
              />
            </Field>
          </div>
        )}

        <div className="mt-4">
          <Field label="Note" hint="Optional — recorded against the stage change">
            <input
              className="input"
              value={stageNote}
              onChange={(e) => setStageNote(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setStageOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={moveStage}
            disabled={busy || !stageTarget}
          >
            Move Stage
          </button>
        </div>
      </Modal>

      {/* Map / update candidate */}
      <Modal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title={editingMap ? `Update ${editingMap.name}` : 'Map Candidate'}
        description={
          editingMap
            ? 'Interview progress for this opportunity only'
            : 'Pick from the candidate pool'
        }
      >
        {mapError && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {mapError}
          </div>
        )}

        <div className="space-y-4">
          {!editingMap && (
            <Field label="Candidate" required>
              <select
                className="input"
                value={mapForm.candidateId}
                onChange={(e) =>
                  setMapForm({ ...mapForm, candidateId: e.target.value })
                }
              >
                <option value="">Select a candidate…</option>
                {pool
                  .filter((c) => !alreadyMapped.has(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.primarySkill ? ` — ${c.primarySkill}` : ''}
                      {` (${SOURCE_LABELS[c.source]})`}
                    </option>
                  ))}
              </select>
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status" required>
              <select
                className="input"
                value={mapForm.status}
                onChange={(e) => setMapForm({ ...mapForm, status: e.target.value })}
              >
                {Object.entries(CANDIDATE_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expected Billing (₹/month)">
              <input
                className="input"
                type="number"
                min={0}
                value={mapForm.expectedBilling}
                onChange={(e) =>
                  setMapForm({ ...mapForm, expectedBilling: e.target.value })
                }
              />
            </Field>
            <Field label="Interview Round" hint="0 when not yet interviewing">
              <input
                className="input"
                type="number"
                min={0}
                max={20}
                value={mapForm.interviewRound}
                onChange={(e) =>
                  setMapForm({ ...mapForm, interviewRound: e.target.value })
                }
              />
            </Field>
            <Field label="Interview Date">
              <input
                className="input"
                type="date"
                value={mapForm.interviewDate}
                onChange={(e) =>
                  setMapForm({ ...mapForm, interviewDate: e.target.value })
                }
              />
            </Field>
          </div>

          <Field label="Feedback">
            <textarea
              className="input min-h-20 resize-y"
              value={mapForm.feedback}
              onChange={(e) => setMapForm({ ...mapForm, feedback: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setMapOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={saveMapping}
            disabled={busy || (!editingMap && !mapForm.candidateId)}
          >
            {editingMap ? 'Save' : 'Map Candidate'}
          </button>
        </div>
      </Modal>

      {/* Convert to project */}
      <Modal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title="Convert to Project"
        description="Creates the delivery-side records from this won opportunity"
      >
        {convertError && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {convertError}
          </div>
        )}

        <div className="mb-4 rounded-md border border-line bg-surface2 px-3 py-2 text-sm text-ink2">
          <ul className="ml-4 list-disc space-y-1">
            {o.isProspect && (
              <li>
                <strong className="text-ink">{o.companyName}</strong> will be created as
                a client.
              </li>
            )}
            <li>A project will be created under that client.</li>
            <li>
              {joined > 0 ? (
                <>
                  <strong className="text-ink">{joined}</strong> candidate
                  {joined === 1 ? '' : 's'} marked <em>joined</em> will get a bench
                  resource and a billable deployment.
                </>
              ) : (
                <>
                  No candidates are marked <em>joined</em> yet, so no deployments will be
                  created.
                </>
              )}
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <Field label="Project Name" required>
            <input
              className="input"
              value={convertForm.projectName}
              onChange={(e) =>
                setConvertForm({ ...convertForm, projectName: e.target.value })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Manager Name">
              <input
                className="input"
                value={convertForm.managerName}
                onChange={(e) =>
                  setConvertForm({ ...convertForm, managerName: e.target.value })
                }
              />
            </Field>
            <Field label="Manager Designation">
              <input
                className="input"
                value={convertForm.managerDesignation}
                onChange={(e) =>
                  setConvertForm({
                    ...convertForm,
                    managerDesignation: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Manager Email">
              <input
                className="input"
                type="email"
                value={convertForm.managerEmail}
                onChange={(e) =>
                  setConvertForm({ ...convertForm, managerEmail: e.target.value })
                }
              />
            </Field>
            <Field label="Manager Mobile">
              <input
                className="input"
                value={convertForm.managerMobile}
                onChange={(e) =>
                  setConvertForm({ ...convertForm, managerMobile: e.target.value })
                }
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink2">
            <input
              type="checkbox"
              checked={convertForm.createDeployments}
              onChange={(e) =>
                setConvertForm({
                  ...convertForm,
                  createDeployments: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-line accent-[rgb(var(--accent))]"
            />
            Open deployments for joined candidates
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setConvertOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={convert} disabled={busy}>
            Convert
          </button>
        </div>
      </Modal>
    </div>
  );
}
