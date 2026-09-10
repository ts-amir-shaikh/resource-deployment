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
  Star,
  ClipboardList,
  Sparkles,
  RefreshCw,
  Building2,
  X,
  Globe,
} from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import {
  formatMoney,
  formatMoneyCompact,
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
import OpportunityFormFields, {
  toFormValues,
  toPayload,
  type ClientOption,
  type OpportunityFormValues,
} from '@/components/opportunity-form';

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
  currency: string;
  dealValue: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  hiringBudgetMin: number | null;
  hiringBudgetMax: number | null;
  isListed: boolean;
  listedAt: string | null;
  publicTitle: string | null;
  publicCompanyLabel: string | null;
  showClientName: boolean;
  jdContent: string | null;
  jdUpdatedAt: string | null;
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
  kind: string;
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

type Criterion = {
  id: number;
  label: string;
  description: string | null;
  scope: string;
};

/** M28 — a question set already generated for this requirement. */
type QuestionSet = {
  id: number;
  title: string;
  output: string;
  userName: string;
  createdAt: string;
  stale: boolean;
};

/** M29 — one interview round, with the panel that sat on it. */
type Round = {
  id: number;
  round: number;
  mode: 'internal_screening' | 'client_round' | 'final';
  scheduledAt: string | null;
  heldAt: string | null;
  outcome: 'pass' | 'fail' | 'hold' | 'no_show' | null;
  feedback: string | null;
  recommendation: string | null;
  questionsAsked: string | null;
  createdAt: string;
  panel: { name: string; designation: string | null }[];
};

type PanelDraft = { name: string; designation: string };

const MODE_LABELS: Record<Round['mode'], string> = {
  internal_screening: 'Internal screening',
  client_round: 'Client round',
  final: 'Final round',
};

const OUTCOME_LABELS: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  hold: 'On hold',
  no_show: 'No show',
};

const OUTCOME_TONE: Record<string, Tone> = {
  pass: 'green',
  fail: 'rose',
  hold: 'amber',
  no_show: 'neutral',
};

/**
 * What the form pre-selects when an outcome is chosen. A suggestion, never a
 * rule — a recruiter can log a pass and still hold the candidate, so this only
 * sets the dropdown's initial value and never overrides a manual choice.
 */
const OUTCOME_SUGGESTS: Record<string, string> = {
  pass: 'submitted',
  fail: 'rejected',
  hold: 'interview',
  no_show: 'interview',
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
  clients,
  resumeTo,
  role,
  roundCounts,
  questionSets,
}: {
  opportunity: Opportunity;
  mapped: Mapped[];
  comments: Comment[];
  history: StageEvent[];
  pool: PoolCandidate[];
  suggestions: Suggestion[];
  clients: ClientOption[];
  resumeTo: string;
  role: Role;
  roundCounts: Record<number, number>;
  questionSets: QuestionSet[];
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

  // M12: correcting the requirement itself — a brief that was taken down
  // wrongly, or terms the client has since restated. Admin only; the same
  // form the pipeline board uses to create one.
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<OpportunityFormValues>(() => toFormValues(o));
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editBanner, setEditBanner] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  function openEdit() {
    // Re-derive from the current row rather than trusting state left over
    // from a previous open — the page refreshes after every mutation.
    setEditForm(toFormValues(o));
    setEditErrors({});
    setEditBanner(null);
    setEditOpen(true);
  }

  async function saveEdit() {
    setEditSaving(true);
    setEditErrors({});
    setEditBanner(null);
    try {
      await api(`/api/opportunities/${o.id}`, {
        method: 'PUT',
        json: toPayload(editForm, clients),
      });
      setEditOpen(false);
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setEditErrors(e.fields);
      setEditBanner(errorMessage(e));
    } finally {
      setEditSaving(false);
    }
  }

  // M16 — publishing this requirement to the public board. Admin and TA both
  // control it: TA lives closest to these roles and keeps the board current.
  const canManageListing = role === 'admin' || role === 'ta';
  const [listingOpen, setListingOpen] = useState(false);
  const [listingForm, setListingForm] = useState({ publicTitle: o.publicTitle ?? '' });
  const [listingBusy, setListingBusy] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const isClosed = ['won', 'lost'].includes(o.stage);

  async function saveListing(isListed: boolean) {
    setListingBusy(true);
    setListingError(null);
    try {
      await api(`/api/opportunities/${o.id}/listing`, {
        method: 'PATCH',
        json: { ...listingForm, isListed },
      });
      setListingOpen(false);
      router.refresh();
    } catch (e) {
      setListingError(errorMessage(e));
    } finally {
      setListingBusy(false);
    }
  }

  /* ── M22: recruiter evaluation ─────────────────────────────
   * Ratings hang off the candidate-to-opportunity mapping, not the candidate:
   * the same person can be strong for one requirement and weak for another,
   * and one profile score could never say that. */
  const [ratingFor, setRatingFor] = useState<Mapped | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [newPointer, setNewPointer] = useState('');
  const [addingPointer, setAddingPointer] = useState(false);

  async function openRating(m: Mapped) {
    setRatingFor(m);
    setRatingError(null);
    setNewPointer('');
    setScores({});
    setCriteria([]);
    try {
      const [list, existing] = await Promise.all([
        api<Criterion[]>(`/api/rating-criteria?opportunity_id=${o.id}`),
        api<{ criterionId: number; score: number }[]>(`/api/ratings/${m.id}`),
      ]);
      setCriteria(list);
      setScores(Object.fromEntries(existing.map((r) => [r.criterionId, r.score])));
    } catch (e) {
      setRatingError(errorMessage(e));
    }
  }

  async function addPointer() {
    const label = newPointer.trim();
    if (!label) return;
    setAddingPointer(true);
    setRatingError(null);
    try {
      // Global by default — a pointer one recruiter adds is offered on every
      // future evaluation, which is what makes this a library not a form.
      const created = await api<Criterion>('/api/rating-criteria', {
        method: 'POST',
        json: { label, scope: 'global' },
      });
      setCriteria((c) => [...c, created]);
      setNewPointer('');
    } catch (e) {
      setRatingError(errorMessage(e));
    } finally {
      setAddingPointer(false);
    }
  }

  async function saveRating() {
    if (!ratingFor) return;
    setRatingBusy(true);
    setRatingError(null);
    try {
      await api(`/api/ratings/${ratingFor.id}`, {
        method: 'PUT',
        json: {
          scores: Object.entries(scores)
            .filter(([, v]) => v > 0)
            .map(([criterionId, score]) => ({ criterionId: Number(criterionId), score })),
        },
      });
      setRatingFor(null);
      router.refresh();
    } catch (e) {
      setRatingError(errorMessage(e));
    } finally {
      setRatingBusy(false);
    }
  }

  const given = Object.values(scores).filter((v) => v > 0);
  const rated = given.length;
  const average = rated ? given.reduce((a, b) => a + b, 0) / rated : 0;

  /* ── M29: interview rounds ─────────────────────────────────
   * The mapping's own feedback column held one round and the next one erased
   * it. Rounds now live in their own table; the mapping keeps mirroring the
   * latest so every existing screen still reads correctly. */
  const [roundsFor, setRoundsFor] = useState<Mapped | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [roundBusy, setRoundBusy] = useState(false);
  const [roundError, setRoundError] = useState<string | null>(null);
  const [roundErrors, setRoundErrors] = useState<Record<string, string>>({});
  const [editingRound, setEditingRound] = useState<number | null>(null);
  const [showRoundForm, setShowRoundForm] = useState(false);
  const [panel, setPanel] = useState<PanelDraft[]>([{ name: '', designation: '' }]);
  const [roundForm, setRoundForm] = useState({
    round: '1',
    mode: 'internal_screening',
    scheduledAt: '',
    heldAt: '',
    outcome: '',
    feedback: '',
    recommendation: '',
    questionsAsked: '',
    moveStatus: '',
  });

  function blankRoundForm(nextRound: number) {
    setRoundForm({
      round: String(nextRound),
      mode: 'internal_screening',
      scheduledAt: '',
      heldAt: today(),
      outcome: '',
      feedback: '',
      recommendation: '',
      questionsAsked: '',
      moveStatus: '',
    });
    setPanel([{ name: '', designation: '' }]);
    setRoundErrors({});
  }

  async function openRounds(m: Mapped) {
    setRoundsFor(m);
    setRounds([]);
    setRoundError(null);
    setEditingRound(null);
    setShowRoundForm(false);
    setRoundsLoading(true);
    try {
      const res = await api<{ rounds: Round[] }>(`/api/interviews/${m.id}`);
      setRounds(res.rounds);
      // Default to the next round rather than making somebody count.
      const next = res.rounds.reduce((n, r) => Math.max(n, r.round), 0) + 1;
      blankRoundForm(next);
      // Nothing recorded yet — open straight into the form rather than showing
      // an empty history the recruiter has to click past.
      if (res.rounds.length === 0) setShowRoundForm(true);
    } catch (e) {
      setRoundError(errorMessage(e));
    } finally {
      setRoundsLoading(false);
    }
  }

  function editRound(r: Round) {
    setEditingRound(r.id);
    setShowRoundForm(true);
    setRoundErrors({});
    setRoundForm({
      round: String(r.round),
      mode: r.mode,
      scheduledAt: r.scheduledAt ?? '',
      heldAt: r.heldAt ?? '',
      outcome: r.outcome ?? '',
      feedback: r.feedback ?? '',
      recommendation: r.recommendation ?? '',
      questionsAsked: r.questionsAsked ?? '',
      moveStatus: '',
    });
    setPanel(
      r.panel.length
        ? r.panel.map((m) => ({ name: m.name, designation: m.designation ?? '' }))
        : [{ name: '', designation: '' }],
    );
  }

  /** Picking an outcome pre-fills the stage move; a manual choice wins. */
  function pickOutcome(outcome: string) {
    setRoundForm((f) => ({
      ...f,
      outcome,
      moveStatus: f.moveStatus || OUTCOME_SUGGESTS[outcome] || '',
      heldAt: f.heldAt || today(),
    }));
  }

  async function saveRound() {
    if (!roundsFor) return;
    setRoundBusy(true);
    setRoundError(null);
    setRoundErrors({});
    try {
      const payload = {
        ...roundForm,
        round: Number(roundForm.round),
        // Blank rows are how somebody leaves the third panel slot alone.
        panel: panel
          .filter((p) => p.name.trim())
          .map((p) => ({ name: p.name.trim(), designation: p.designation.trim() })),
      };
      if (editingRound) {
        await api(`/api/interviews/${roundsFor.id}/${editingRound}`, {
          method: 'PATCH',
          json: payload,
        });
      } else {
        await api(`/api/interviews/${roundsFor.id}`, { method: 'POST', json: payload });
      }
      const res = await api<{ rounds: Round[] }>(`/api/interviews/${roundsFor.id}`);
      setRounds(res.rounds);
      setShowRoundForm(false);
      setEditingRound(null);
      blankRoundForm(res.rounds.reduce((n, r) => Math.max(n, r.round), 0) + 1);
      // The mapping's status and latest-round mirror both changed behind this.
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setRoundErrors(e.fields);
      setRoundError(errorMessage(e));
    } finally {
      setRoundBusy(false);
    }
  }

  /* ── M28: interview questions for this requirement ─────────
   * Generated on demand rather than on every JD save: an automatic run would
   * spend money on a typo fix. A stale set says so and offers the button. */
  const [questionsBusy, setQuestionsBusy] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [openSet, setOpenSet] = useState<number | null>(questionSets[0]?.id ?? null);
  const latestSet = questionSets[0] ?? null;

  async function generateQuestions() {
    setQuestionsBusy(true);
    setQuestionsError(null);
    try {
      const body = new FormData();
      body.set('agent', 'interview_questions');
      body.set('opportunityId', String(o.id));
      body.set('title', `Interview questions · ${o.title}`);
      const res = await fetch('/api/agents/run', { method: 'POST', body });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? 'The agent could not be run');
      setOpenSet(payload.id);
      router.refresh();
    } catch (e) {
      setQuestionsError(errorMessage(e));
    } finally {
      setQuestionsBusy(false);
    }
  }

  // A prospect is a company we are talking to that has no client record yet.
  // Onboarding is a commercial act, so Admin only.
  const [onboarding, setOnboarding] = useState(false);
  async function convertToClient() {
    setOnboarding(true);
    try {
      await api(`/api/opportunities/${o.id}/convert-client`, { method: 'POST' });
      router.refresh();
    } catch (e) {
      setStageError(errorMessage(e));
    } finally {
      setOnboarding(false);
    }
  }

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
            {o.isListed && (
              <a
                href={`/jobs/${o.id}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost"
                title="Open the public listing"
              >
                <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Listed
              </a>
            )}
            {o.isProspect && canEditRequirement && (
              <button className="btn-ghost" onClick={convertToClient} disabled={onboarding}>
                <Building2 className="h-4 w-4" />
                {onboarding ? 'Onboarding…' : 'Onboard as client'}
              </button>
            )}
            {canManageListing && !isClosed && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setListingForm({ publicTitle: o.publicTitle ?? '' });
                  setListingError(null);
                  setListingOpen(true);
                }}
              >
                <Globe className="h-4 w-4" />
                {o.isListed ? 'Listing' : 'Publish to job board'}
              </button>
            )}
            {canEditRequirement && (
              <button className="btn-ghost" onClick={openEdit}>
                <Pencil className="h-4 w-4" /> Edit requirement
              </button>
            )}
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

          {/* M28 — interview questions for this requirement */}
          <section className="card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Sparkles className="h-4 w-4 text-brand" /> Interview Questions
                </h2>
                <p className="mt-0.5 text-2xs text-ink3">
                  Grouped by the rating pointers this candidate will be scored against
                </p>
              </div>
              {!readOnly && (
                <button
                  className="btn-ghost"
                  onClick={generateQuestions}
                  disabled={questionsBusy}
                >
                  {questionsBusy ? (
                    <>
                      <CalendarClock className="h-3.5 w-3.5 animate-pulse" /> Generating…
                    </>
                  ) : (
                    <>
                      {latestSet ? (
                        <RefreshCw className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {latestSet ? 'Regenerate' : 'Generate questions'}
                    </>
                  )}
                </button>
              )}
            </header>

            {questionsError && (
              <p className="border-b border-line px-4 py-2 text-xs text-rose-600 dark:text-rose-400">
                {questionsError}
              </p>
            )}

            {latestSet?.stale && (
              <p className="border-b border-line bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                The job description has changed since these questions were written — they
                may no longer describe the role. Regenerate when you need them.
              </p>
            )}

            {questionSets.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink3">
                {o.jdContent
                  ? 'No question set yet. Generating one reads this requirement and its rating pointers.'
                  : 'Add a job description to this requirement first — the questions are written from it.'}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {questionSets.map((q) => (
                  <li key={q.id}>
                    <button
                      onClick={() => setOpenSet(openSet === q.id ? null : q.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface2/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-ink">
                          {q.title}
                        </span>
                        <span className="tnum block text-2xs text-ink3">
                          {q.userName} · {formatDate(q.createdAt.slice(0, 10))}
                        </span>
                      </span>
                      {q.stale && <Badge tone="amber">JD changed since</Badge>}
                    </button>
                    {openSet === q.id && (
                      <div className="max-h-[32rem] overflow-y-auto border-t border-line bg-surface2/40 px-4 py-3">
                        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink2">
                          {q.output}
                        </pre>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

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
                        {(roundCounts[m.id] ?? 0) > 1 && (
                          <button
                            onClick={() => openRounds(m)}
                            className="mt-1 text-2xs text-brand hover:underline"
                          >
                            {roundCounts[m.id]} rounds recorded
                          </button>
                        )}
                      </td>
                      <td className="td text-right">
                        <span className="tnum text-ink">
                          {formatMoney(m.expectedBilling, 'INR')}
                        </span>
                      </td>
                      <td className="td text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openRounds(m)}
                            className="relative rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-brand"
                            aria-label={`Interview feedback for ${m.name}`}
                            title="Interview rounds and panel feedback"
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            {(roundCounts[m.id] ?? 0) > 0 && (
                              <span className="absolute -right-0.5 -top-0.5 rounded-full bg-brand px-1 text-[9px] font-semibold leading-4 text-white">
                                {roundCounts[m.id]}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => openRating(m)}
                            className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-amber-500"
                            aria-label={`Rate ${m.name}`}
                            title="Recruiter evaluation"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
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
                    {sg.kind === 'application' ? (
                      <Badge tone="blue">Applied</Badge>
                    ) : (
                      <Badge tone="violet">Referred</Badge>
                    )}
                    {sg.status === 'new' && <Badge tone="amber">New</Badge>}
                    {sg.status === 'accepted' && <Badge tone="green">In pool</Badge>}
                    {sg.status === 'dismissed' && (
                      <Badge tone="neutral">Dismissed</Badge>
                    )}
                  </div>

                  <div className="mt-1 text-2xs text-ink3">
                    {sg.kind === 'application'
                      ? 'Applied via the job board'
                      : `Referred by ${sg.referrerName}`}
                    {sg.kind !== 'application' && sg.referrerEmail && ` · ${sg.referrerEmail}`}
                    {sg.kind !== 'application' && sg.referrerMobile && ` · ${sg.referrerMobile}`}
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
                        sg.currentCtc !== null && `current ${formatMoneyCompact(sg.currentCtc, 'INR')}`,
                        sg.expectedCtc !== null &&
                          `expected ${formatMoneyCompact(sg.expectedCtc, 'INR')}`,
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
                  Applications from the job board and profiles recommended through the
                  share link land here for review before joining the candidate pool.
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
                disabled={busy || !commentBody.trim()}
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
      {/* Recruiter evaluation */}
      <Modal
        open={Boolean(ratingFor)}
        onClose={() => setRatingFor(null)}
        title={ratingFor ? `Evaluate ${ratingFor.name}` : 'Evaluate'}
        description="Scored against this requirement — the same candidate can rate differently elsewhere"
      >
        {ratingError && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {ratingError}
          </div>
        )}

        {criteria.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink3">Loading pointers…</p>
        ) : (
          <ul className="divide-y divide-line">
            {criteria.map((c) => (
              <li key={c.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{c.label}</div>
                    {c.description && (
                      <div className="text-2xs text-ink3">{c.description}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          setScores((prev) => ({
                            ...prev,
                            // Clicking the current score clears it — a blank
                            // pointer means "not assessed", which is different
                            // from a 1 and should stay expressible.
                            [c.id]: prev[c.id] === n ? 0 : n,
                          }))
                        }
                        aria-label={`${c.label}: ${n} of 5`}
                        className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                          (scores[c.id] ?? 0) >= n
                            ? 'bg-amber-400 text-amber-950'
                            : 'border border-line text-ink3 hover:border-amber-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 rounded-md border border-line bg-surface2 p-3">
          <div className="text-2xs font-medium uppercase tracking-wider text-ink3">
            Add a pointer
          </div>
          <p className="mt-0.5 text-2xs text-ink3">
            It joins the set offered on every future evaluation, so the team
            scores against the same things.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              className="input"
              placeholder="e.g. Domain knowledge — BFSI"
              value={newPointer}
              onChange={(e) => setNewPointer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addPointer();
                }
              }}
            />
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={addPointer}
              disabled={addingPointer || !newPointer.trim()}
            >
              Add
            </button>
          </div>
        </div>

        {rated > 0 && (
          <div className="mt-3 flex items-baseline justify-between rounded-md border border-line px-3 py-2">
            <span className="text-xs text-ink2">
              Average across {rated} scored pointer{rated === 1 ? '' : 's'}
            </span>
            <span className="tnum text-lg font-semibold text-ink">
              {average.toFixed(1)}
              <span className="text-xs font-normal text-ink3"> / 5</span>
            </span>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setRatingFor(null)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={saveRating} disabled={ratingBusy}>
            {ratingBusy ? 'Saving…' : 'Save evaluation'}
          </button>
        </div>
      </Modal>

      {/* Public job board listing */}
      <Modal
        open={listingOpen}
        onClose={() => setListingOpen(false)}
        title={o.isListed ? 'Public listing' : 'Publish to the job board'}
        description="Anyone can read this page, and search engines may index it"
      >
        {listingError && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {listingError}
          </div>
        )}

        <div className="space-y-3">
          <Field
            label="Advert title"
            hint="Leave blank to use the internal title — rarely the right headline"
          >
            <input
              className="input"
              placeholder={o.title}
              value={listingForm.publicTitle}
              onChange={(e) =>
                setListingForm({ ...listingForm, publicTitle: e.target.value })
              }
            />
          </Field>

          <div className="rounded-md border border-line bg-surface2 px-3 py-2">
            <div className="text-2xs font-medium uppercase tracking-wider text-ink3">
              Client shown as
            </div>
            <div className="mt-0.5 text-sm text-ink">
              {o.showClientName ? o.companyName : (o.publicCompanyLabel || 'A Techstalwarts client')}
              {o.showClientName && (
                <Badge tone="amber">named publicly</Badge>
              )}
            </div>
            <p className="mt-1 text-2xs text-ink3">
              {canEditRequirement
                ? 'Change this on Edit requirement — how a client is described publicly is an Admin decision.'
                : 'Set by Admin on the requirement itself.'}
            </p>
          </div>

          <div className="rounded-md border border-line bg-surface2 px-3 py-2 text-2xs text-ink3">
            Never published: budget, hiring budget, pipeline stage, owner, next step
            and every candidate detail. De-listing stops serving the page but cannot
            un-publish a copy already cached or shared.
          </div>
        </div>

        <div className="mt-6 flex justify-between gap-2 border-t border-line pt-4">
          {o.isListed ? (
            <button
              className="btn-ghost text-rose-600 dark:text-rose-400"
              onClick={() => saveListing(false)}
              disabled={listingBusy}
            >
              Remove from board
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setListingOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={() => saveListing(true)}
              disabled={listingBusy}
            >
              {listingBusy ? 'Saving…' : o.isListed ? 'Save changes' : 'Publish'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit requirement — Admin only */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Requirement"
        description="Stage, candidates and comments are untouched — those move through their own actions"
        wide
      >
        {editBanner && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {editBanner}
          </div>
        )}

        <OpportunityFormFields
          form={editForm}
          setForm={setEditForm}
          errors={editErrors}
          clients={clients}
        />

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setEditOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={saveEdit} disabled={editSaving}>
            {editSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Modal>


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

        {o.isListed && ['won', 'lost'].includes(stageTarget) && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This role is live on the job board and will be{' '}
              <strong>removed automatically</strong>. Anyone opening its link will be
              told the requirement is closed.
            </span>
          </div>
        )}

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

      {/* M29 — interview rounds and panel feedback */}
      <Modal
        open={roundsFor !== null}
        onClose={() => setRoundsFor(null)}
        title={roundsFor ? `Interviews · ${roundsFor.name}` : 'Interviews'}
        description="Every round is kept. Recording an outcome can move the candidate in the same step."
        wide
      >
        {roundError && (
          <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {roundError}
          </p>
        )}

        {roundsLoading ? (
          <p className="py-6 text-center text-sm text-ink3">Loading rounds…</p>
        ) : (
          <>
            {rounds.length > 0 && (
              <ul className="mb-4 space-y-2">
                {rounds.map((r) => (
                  <li key={r.id} className="rounded-lg border border-line px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-ink">Round {r.round}</span>
                      <Badge tone="neutral">{MODE_LABELS[r.mode]}</Badge>
                      {r.outcome ? (
                        <Badge tone={OUTCOME_TONE[r.outcome]}>{OUTCOME_LABELS[r.outcome]}</Badge>
                      ) : (
                        <Badge tone="blue">Scheduled</Badge>
                      )}
                      <span className="tnum ml-auto text-2xs text-ink3">
                        {formatDate(r.heldAt ?? r.scheduledAt)}
                      </span>
                      {!readOnly && (
                        <button
                          onClick={() => editRound(r)}
                          className="rounded p-1 text-ink3 hover:bg-surface2 hover:text-ink"
                          aria-label={`Edit round ${r.round}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {r.panel.length > 0 && (
                      <div className="mt-1 text-2xs text-ink3">
                        Panel:{' '}
                        {r.panel
                          .map((m) => m.name + (m.designation ? ` (${m.designation})` : ''))
                          .join(', ')}
                      </div>
                    )}
                    {r.feedback && (
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-ink2">
                        {r.feedback}
                      </p>
                    )}
                    {r.recommendation && (
                      <p className="mt-1 text-2xs italic text-ink3">
                        Recommendation: {r.recommendation}
                      </p>
                    )}
                    {r.questionsAsked && (
                      <p className="mt-1 whitespace-pre-wrap text-2xs text-ink3">
                        Asked: {r.questionsAsked}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!showRoundForm && !readOnly && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setEditingRound(null);
                  blankRoundForm(rounds.reduce((n, r) => Math.max(n, r.round), 0) + 1);
                  setShowRoundForm(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Log a round
              </button>
            )}

            {showRoundForm && !readOnly && (
              <div className="space-y-4 rounded-lg border border-line p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Round" required error={roundErrors.round}>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className="input"
                      value={roundForm.round}
                      onChange={(e) => setRoundForm({ ...roundForm, round: e.target.value })}
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      className="input"
                      value={roundForm.mode}
                      onChange={(e) => setRoundForm({ ...roundForm, mode: e.target.value })}
                    >
                      {(['internal_screening', 'client_round', 'final'] as const).map((m) => (
                        <option key={m} value={m}>
                          {MODE_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Held on"
                    hint="Leave blank if it has not happened yet"
                    error={roundErrors.heldAt}
                  >
                    <input
                      type="date"
                      className="input"
                      value={roundForm.heldAt}
                      onChange={(e) => setRoundForm({ ...roundForm, heldAt: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Scheduled for" error={roundErrors.scheduledAt}>
                  <input
                    type="date"
                    className="input"
                    value={roundForm.scheduledAt}
                    onChange={(e) => setRoundForm({ ...roundForm, scheduledAt: e.target.value })}
                  />
                </Field>

                {/* Typed names — no interviewer has a login yet (M31). */}
                <div>
                  <div className="label">Interview panel</div>
                  <div className="space-y-2">
                    {panel.map((member, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          className="input flex-1"
                          placeholder="Interviewer name"
                          value={member.name}
                          onChange={(e) => {
                            const next = [...panel];
                            next[i] = { ...next[i], name: e.target.value };
                            setPanel(next);
                          }}
                        />
                        <input
                          className="input flex-1"
                          placeholder="Designation (optional)"
                          value={member.designation}
                          onChange={(e) => {
                            const next = [...panel];
                            next[i] = { ...next[i], designation: e.target.value };
                            setPanel(next);
                          }}
                        />
                        <button
                          onClick={() => setPanel(panel.filter((_, j) => j !== i))}
                          className="rounded p-2 text-ink3 hover:bg-surface2 hover:text-rose-600 disabled:opacity-40"
                          aria-label="Remove interviewer"
                          disabled={panel.length === 1}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {panel.length < 8 && (
                    <button
                      className="mt-2 text-xs text-brand hover:underline"
                      onClick={() => setPanel([...panel, { name: '', designation: '' }])}
                    >
                      + Add interviewer
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Outcome" hint="Leave blank while the round is only scheduled">
                    <select
                      className="input"
                      value={roundForm.outcome}
                      onChange={(e) => pickOutcome(e.target.value)}
                    >
                      <option value="">Not held yet</option>
                      {(['pass', 'fail', 'hold', 'no_show'] as const).map((v) => (
                        <option key={v} value={v}>
                          {OUTCOME_LABELS[v]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Then move the candidate to"
                    hint="Suggested from the outcome — change it or leave it alone"
                  >
                    <select
                      className="input"
                      value={roundForm.moveStatus}
                      onChange={(e) => setRoundForm({ ...roundForm, moveStatus: e.target.value })}
                    >
                      <option value="">Leave the status unchanged</option>
                      {Object.entries(CANDIDATE_STATUS_LABELS).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field
                  label="Feedback"
                  required={roundForm.outcome !== ''}
                  error={roundErrors.feedback}
                >
                  <textarea
                    rows={4}
                    className="input"
                    placeholder="What the panel said — strengths, gaps, and why this outcome."
                    value={roundForm.feedback}
                    onChange={(e) => setRoundForm({ ...roundForm, feedback: e.target.value })}
                  />
                </Field>

                <Field label="Recommendation" hint="Optional one-liner">
                  <input
                    className="input"
                    value={roundForm.recommendation}
                    onChange={(e) =>
                      setRoundForm({ ...roundForm, recommendation: e.target.value })
                    }
                  />
                </Field>

                <Field
                  label="Questions asked"
                  hint="Optional. Worth recording — it is what makes a question set improvable."
                >
                  <textarea
                    rows={3}
                    className="input"
                    value={roundForm.questionsAsked}
                    onChange={(e) =>
                      setRoundForm({ ...roundForm, questionsAsked: e.target.value })
                    }
                  />
                </Field>

                <div className="flex justify-end gap-2 border-t border-line pt-3">
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setShowRoundForm(false);
                      setEditingRound(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={saveRound} disabled={roundBusy}>
                    {editingRound ? 'Save round' : 'Log round'}
                  </button>
                </div>
              </div>
            )}

            {rounds.length === 0 && readOnly && (
              <p className="py-6 text-center text-sm text-ink3">
                No interview rounds recorded for this candidate.
              </p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
