/**
 * Review and skill rules (M67) — pure, and safe to import from client
 * components.
 *
 * What a review is due for, which status moves are allowed and how scores
 * average all live here, so the tracker, the review screens and the API
 * routes cannot each settle them differently. Server-side reads and writes
 * are in lib/reviews.ts.
 */

/* ── Statuses ──────────────────────────────────────────────── */

/**
 * Q3: the Resource Manager submits (which locks the review), Admin approves or
 * returns it, and may reopen a locked one later. A returned or reopened review
 * goes back to draft rather than to a status of its own, so "what can be
 * edited" stays a single question: is it a draft?
 */
export const REVIEW_STATUSES = ['draft', 'submitted', 'approved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
};

export const REVIEW_ACTIONS = ['submit', 'approve', 'return', 'reopen'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** The status an action moves a review to, or an error when it may not. */
export function reviewTransition(
  status: ReviewStatus,
  action: ReviewAction,
): { to: ReviewStatus; error?: never } | { to?: never; error: string } {
  if (action === 'submit') {
    return status === 'draft' ? { to: 'submitted' } : { error: 'Only a draft can be submitted.' };
  }
  // Reopen is how a locked review is changed later: from submitted, or from
  // approved, where Return does not reach. Both end in a draft, and the next
  // submit is a new version that has to say what changed.
  if (action === 'reopen') {
    return status === 'draft' ? { error: 'A draft is already open for editing.' } : { to: 'draft' };
  }
  if (status !== 'submitted') return { error: 'Only a submitted review can be approved or returned.' };
  return { to: action === 'approve' ? 'approved' : 'draft' };
}

/**
 * Only a draft is edited; a submitted or approved review is locked. Admin
 * changes one by reopening it, not by editing it in place, so every change
 * lands in a new version that can be compared with the last.
 */
export function isReviewEditable(status: ReviewStatus): boolean {
  return status === 'draft';
}

/* ── Account rating ────────────────────────────────────────── */

export const ACCOUNT_RATINGS = ['green', 'amber', 'red'] as const;
export type AccountRating = (typeof ACCOUNT_RATINGS)[number];

export const ACCOUNT_RATING_LABELS: Record<AccountRating, string> = {
  green: 'Green — on track',
  amber: 'Amber — watch',
  red: 'Red — at risk',
};

/* ── Scores ────────────────────────────────────────────────── */

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

export const SCORE_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Below expectations',
  3: 'Meets expectations',
  4: 'Strong',
  5: 'Outstanding',
};

/** Q4: the criteria a fresh database starts with. */
export const DEFAULT_REVIEW_CRITERIA = [
  { label: 'Technical skill', description: 'Quality and correctness of the work delivered.' },
  { label: 'Communication', description: 'Clarity with the client team and with us.' },
  { label: 'Reliability & timesheets', description: 'Attendance, punctuality, timesheets on time.' },
  { label: 'Client satisfaction', description: 'How the client rates the engagement.' },
] as const;

export function isValidScore(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= MIN_SCORE && n <= MAX_SCORE;
}

/**
 * The mean of the scores given, to one decimal place. Null — never 0 — when
 * nothing is scored: an unscored review is unknown, not poor, and a 0 would
 * drag down every trend and average it touched (as opportunityValue() does
 * for an unpriced requirement).
 */
export function averageScore(scores: readonly (number | null | undefined)[]): number | null {
  const valid = scores.filter(isValidScore);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((s, n) => s + n, 0) / valid.length) * 10) / 10;
}

/**
 * Why a review cannot be submitted yet, or null when it can. Every active
 * criterion needs a score: a half-scored review would average over a
 * different set of criteria than its neighbours and the trend would lie.
 */
export function submitError(
  criterionIds: readonly number[],
  scores: readonly { criterionId: number; score: number | null }[],
  extras: readonly { score: number | null }[] = [],
): string | null {
  const scored = new Set(scores.filter((s) => isValidScore(s.score)).map((s) => s.criterionId));
  // An extra criterion counts like any other: it is in the average, so it must be scored.
  const missing = criterionIds.filter((id) => !scored.has(id)).length + extras.filter((e) => !isValidScore(e.score)).length;
  if (missing === 0) return null;
  return missing === 1 ? 'Score every criterion before submitting — one is missing.' : `Score every criterion before submitting — ${missing} are missing.`;
}

/* ── Extra criteria (one review, one month) ─────────────────── */

/**
 * A team head can add criteria the standard list lacks to a single review.
 * They belong to that resource's review for that month alone: nothing carries
 * to the next month or to anyone else, so the standard criteria — which
 * trends compare across months — stay the same for everyone.
 */
export const MAX_EXTRA_SCORES = 5;
export const EXTRA_LABEL_MAX = 60;

/** Trimmed, single-spaced, for storing and for comparing. */
export function extraLabelKey(label: string | null | undefined): string {
  return (label ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Why a review's extra criteria cannot be saved, or null. `reservedLabels` are
 * the standard criteria: an extra with the same name would read as a duplicate
 * row in the same list.
 */
export function extraScoresError(
  extras: readonly { label: string }[],
  reservedLabels: readonly string[] = [],
): string | null {
  if (extras.length > MAX_EXTRA_SCORES) return `At most ${MAX_EXTRA_SCORES} extra criteria on one review.`;
  const seen = new Set(reservedLabels.map(extraLabelKey));
  for (const e of extras) {
    const key = extraLabelKey(e.label);
    if (!key) return 'Name every extra criterion, or remove the empty one.';
    if (key.length > EXTRA_LABEL_MAX) return `Keep an extra criterion's name under ${EXTRA_LABEL_MAX} characters.`;
    if (seen.has(key)) return `"${e.label.trim()}" is already on this review.`;
    seen.add(key);
  }
  return null;
}

/* ── Versions ──────────────────────────────────────────────── */

/**
 * Every submit locks the review as a numbered version: a snapshot of what it
 * said at that moment. A review reopened and submitted again becomes version 2,
 * and so on, and Admin can see what changed between any two. The snapshot is
 * stored with criterion labels rather than ids, so renaming or retiring a
 * criterion later does not rewrite history.
 */
export type PerformanceSnapshot = {
  summary: string | null;
  strengths: string | null;
  improvements: string | null;
  clientFeedback: string | null;
  clientFeedbackBy: string | null;
  clientFeedbackDate: string | null;
  scores: { label: string; score: number; note: string | null }[];
  extras: { label: string; score: number | null; note: string | null }[];
  average: number | null;
};

export type AccountSnapshot = {
  rating: AccountRating | null;
  summary: string | null;
  risks: string | null;
  opportunities: string | null;
  actions: string | null;
};

/** One thing that differs between two versions. A null side means "not there". */
export type VersionChange = { field: string; from: string | null; to: string | null };

export const CHANGE_NOTE_MAX = 1000;

/**
 * Every submit after the first must say what changed. The first version has
 * nothing to change from, so it needs no note.
 */
export function changeNoteError(existingVersions: number, note: string | null | undefined): string | null {
  if (existingVersions === 0) return null;
  return (note ?? '').trim() ? null : 'Say what changed since the last version before submitting.';
}

const clean = (v: string | null | undefined): string | null => (v == null || v.trim() === '' ? null : v.trim());

function pushIfChanged(out: VersionChange[], field: string, from: string | null | undefined, to: string | null | undefined) {
  const a = clean(from);
  const b = clean(to);
  if (a !== b) out.push({ field, from: a, to: b });
}

const num = (n: number | null | undefined): string | null => (n == null ? null : String(n));

/** What changed from `prev` to `next`, in the order the review shows it. */
export function diffPerformance(prev: PerformanceSnapshot, next: PerformanceSnapshot): VersionChange[] {
  const out: VersionChange[] = [];
  const keyed = (rows: { label: string; score: number | null; note: string | null }[]) =>
    new Map(rows.map((r) => [r.label.trim().toLowerCase(), r]));
  const compare = (before: ReturnType<typeof keyed>, after: ReturnType<typeof keyed>, prefix: string) => {
    for (const key of [...after.keys(), ...[...before.keys()].filter((k) => !after.has(k))]) {
      const a = before.get(key);
      const b = after.get(key);
      const label = `${prefix}${(b ?? a)!.label}`;
      if (a?.score !== b?.score) out.push({ field: label, from: num(a?.score), to: num(b?.score) });
      if (a && b) pushIfChanged(out, `${label} — note`, a.note, b.note);
    }
  };
  compare(keyed(prev.scores), keyed(next.scores), '');
  compare(keyed(prev.extras), keyed(next.extras), 'Extra: ');
  if (prev.average !== next.average) {
    out.push({ field: 'Average', from: prev.average == null ? null : prev.average.toFixed(1), to: next.average == null ? null : next.average.toFixed(1) });
  }
  pushIfChanged(out, 'Summary', prev.summary, next.summary);
  pushIfChanged(out, 'Strengths', prev.strengths, next.strengths);
  pushIfChanged(out, 'To improve', prev.improvements, next.improvements);
  pushIfChanged(out, 'Client feedback', prev.clientFeedback, next.clientFeedback);
  pushIfChanged(out, 'Feedback given by', prev.clientFeedbackBy, next.clientFeedbackBy);
  pushIfChanged(out, 'Feedback date', prev.clientFeedbackDate, next.clientFeedbackDate);
  return out;
}

export function diffAccount(prev: AccountSnapshot, next: AccountSnapshot): VersionChange[] {
  const out: VersionChange[] = [];
  pushIfChanged(out, 'Rating', prev.rating, next.rating);
  pushIfChanged(out, 'Summary', prev.summary, next.summary);
  pushIfChanged(out, 'Risks', prev.risks, next.risks);
  pushIfChanged(out, 'Growth opportunities', prev.opportunities, next.opportunities);
  pushIfChanged(out, 'Actions', prev.actions, next.actions);
  return out;
}

/* ── Periods ───────────────────────────────────────────────── */

/** A review covers one calendar month: `YYYY-MM`. */
export function isPeriod(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return false;
  const year = Number(s.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

/** The month a date falls in. */
export function periodOf(date: string): string {
  return date.slice(0, 7);
}

/** First and last day of a period, as ISO dates. */
export function periodBounds(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

/** The period `delta` months away (negative for earlier). */
export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "October 2026". */
export function periodLabel(period: string): string {
  if (!isPeriod(period)) return period;
  return new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/* ── What is due ───────────────────────────────────────────── */

export type DeploymentWindow = { startDate: string; endDate: string | null };

/**
 * A deployment owes a review for any month it was active in at all — a
 * resource who rolled off on the 3rd still worked for that client that month,
 * and the client has a view on it.
 */
export function activeInPeriod(d: DeploymentWindow, period: string): boolean {
  const { from, to } = periodBounds(period);
  if (!d.startDate || d.startDate > to) return false;
  return d.endDate === null || d.endDate === '' || d.endDate >= from;
}

export type DueDeployment = DeploymentWindow & { id: number; clientId: number };

/** The deployments and clients a period's reviews are due for. */
export function dueInPeriod<T extends DueDeployment>(
  deployments: readonly T[],
  period: string,
): { deployments: T[]; clientIds: number[] } {
  const due = deployments.filter((d) => activeInPeriod(d, period));
  return { deployments: due, clientIds: [...new Set(due.map((d) => d.clientId))].sort((a, b) => a - b) };
}

export type Completion = { due: number; notStarted: number; draft: number; submitted: number; approved: number };

/** Counts for the tracker header. A review for something no longer due still counts as done. */
export function completion(dueKeys: readonly number[], statuses: ReadonlyMap<number, ReviewStatus>): Completion {
  const out: Completion = { due: dueKeys.length, notStarted: 0, draft: 0, submitted: 0, approved: 0 };
  for (const key of dueKeys) {
    const s = statuses.get(key);
    if (s === undefined) out.notStarted++;
    else out[s]++;
  }
  return out;
}

/* ── Skills ────────────────────────────────────────────────── */

export const SKILL_LEVELS = [1, 2, 3, 4, 5] as const;

export const SKILL_LEVEL_LABELS: Record<number, string> = {
  1: 'Beginner',
  2: 'Working',
  3: 'Proficient',
  4: 'Advanced',
  5: 'Expert',
};

/** Trimmed, single-spaced. Two skills that differ only in case are one skill. */
export function normaliseSkillName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}

export function skillKey(name: string | null | undefined): string {
  return normaliseSkillName(name).toLowerCase();
}

/**
 * The distinct skill names in a set of resources' free-text skills, used once
 * to seed the catalogue. `otherSkills` is the JSON array the resources table
 * stores; anything unparseable is skipped rather than failing the backfill.
 */
export function skillNamesFromResources(
  rows: readonly { primarySkill: string | null; secondarySkill: string | null; otherSkills: string | null }[],
): string[] {
  const byKey = new Map<string, string>();
  const add = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const name = normaliseSkillName(raw);
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  };
  for (const r of rows) {
    add(r.primarySkill);
    add(r.secondarySkill);
    if (!r.otherSkills) continue;
    try {
      const parsed: unknown = JSON.parse(r.otherSkills);
      if (Array.isArray(parsed)) parsed.forEach(add);
    } catch {
      // A malformed list is skipped; the resource's other skills stay as typed.
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}
