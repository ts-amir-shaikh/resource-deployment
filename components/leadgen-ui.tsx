'use client';

import Link from 'next/link';
import { AlertTriangle, Check, Flame, Snowflake, Sun } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui';
import {
  BANT_KEYS,
  BANT_LABELS,
  LEAD_STATUS_LABELS,
  PROSPECT_STAGE_LABELS,
  TEMPERATURE_LABELS,
  type LeadStatus,
  type ProspectStage,
  type Temperature,
} from '@/lib/leadgen-rules';
import { formatDate } from '@/lib/utils';

/** Shared pieces of the M66 screens: the badges, the BANT ticks and the duplicate warning. */

const TEMP_TONE: Record<Temperature, Tone> = { cold: 'blue', warm: 'amber', hot: 'rose' };
const TEMP_ICON = { cold: Snowflake, warm: Sun, hot: Flame } as const;

/** D12: a marker, never a column. */
export function TemperatureBadge({ value }: { value: string }) {
  const t = (value in TEMP_TONE ? value : 'cold') as Temperature;
  const Icon = TEMP_ICON[t];
  return (
    <Badge tone={TEMP_TONE[t]}>
      <Icon className="mr-1 h-3 w-3" aria-hidden />
      {TEMPERATURE_LABELS[t]}
    </Badge>
  );
}

const STAGE_TONE: Record<ProspectStage, Tone> = {
  new: 'neutral',
  contacted: 'blue',
  meeting_set: 'violet',
  qualified: 'amber',
  converted: 'green',
  dead: 'rose',
};

export function StageBadge({ value }: { value: string }) {
  const s = value as ProspectStage;
  return <Badge tone={STAGE_TONE[s] ?? 'neutral'}>{PROSPECT_STAGE_LABELS[s] ?? value}</Badge>;
}

const LEAD_TONE: Record<LeadStatus, Tone> = {
  open: 'blue',
  handed_off: 'violet',
  requirement_raised: 'green',
  closed_lost: 'rose',
};

export function LeadStatusBadge({ value }: { value: string }) {
  const s = value as LeadStatus;
  return <Badge tone={LEAD_TONE[s] ?? 'neutral'}>{LEAD_STATUS_LABELS[s] ?? value}</Badge>;
}

export type Bant = { bantBudget: boolean; bantAuthority: boolean; bantNeed: boolean; bantTimeline: boolean };

export const BANT_FIELD: Record<(typeof BANT_KEYS)[number], keyof Bant> = {
  budget: 'bantBudget',
  authority: 'bantAuthority',
  need: 'bantNeed',
  timeline: 'bantTimeline',
};

/** Q5: shown at handoff, gating nothing. */
export function BantTicks({ value, compact }: { value: Bant; compact?: boolean }) {
  return (
    <span className="inline-flex gap-1" aria-label="BANT qualification">
      {BANT_KEYS.map((k) => {
        const on = value[BANT_FIELD[k]];
        return (
          <span
            key={k}
            title={`${BANT_LABELS[k]}: ${on ? 'yes' : 'not yet'}`}
            className={`inline-flex items-center rounded border px-1 text-2xs font-medium ${
              on ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300' : 'border-line text-ink3'
            }`}
          >
            {on && <Check className="mr-0.5 h-2.5 w-2.5" aria-hidden />}
            {compact ? BANT_LABELS[k][0] : BANT_LABELS[k]}
          </span>
        );
      })}
    </span>
  );
}

export function BantEditor({ value, onChange }: { value: Bant; onChange: (v: Bant) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {BANT_KEYS.map((k) => (
        <label key={k} className="flex items-center gap-1.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={value[BANT_FIELD[k]]}
            onChange={(e) => onChange({ ...value, [BANT_FIELD[k]]: e.target.checked })}
          />
          {BANT_LABELS[k]}
        </label>
      ))}
    </div>
  );
}

export type DuplicateHit = { kind: 'prospect' | 'client'; id: number; name: string; ownerName: string | null };

/**
 * Q6: a warning, not a block. Lists the matches with links and leaves the
 * decision to the person who knows whether it is the same company.
 */
export function DuplicateWarning({
  hits,
  onConfirm,
  confirmLabel = 'Create anyway',
}: {
  hits: DuplicateHit[];
  onConfirm?: () => void;
  confirmLabel?: string;
}) {
  if (!hits.length) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-4 w-4" aria-hidden /> This may already exist
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {hits.map((h) => (
          <li key={`${h.kind}${h.id}`}>
            <Link
              className="underline"
              href={h.kind === 'client' ? '/clients' : `/prospects/${h.id}`}
              target="_blank"
            >
              {h.name}
            </Link>{' '}
            <span className="text-xs">
              ({h.kind === 'client' ? 'client' : `prospect${h.ownerName ? `, ${h.ownerName}` : ''}`})
            </span>
          </li>
        ))}
      </ul>
      {onConfirm && (
        <button type="button" className="btn-ghost mt-2 text-amber-900 dark:text-amber-200" onClick={onConfirm}>
          {confirmLabel}
        </button>
      )}
    </div>
  );
}

export type FollowUp = {
  id: number;
  label: string;
  href: string;
  type: string;
  nextFollowUp: string | null;
  nextStep: string | null;
};

/** R2: "follow-ups due" on the Leadgen views. */
export function FollowUpsPanel({ items }: { items: FollowUp[] }) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-ink">Follow-ups due</h2>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-ink3">Nothing due. Follow-up dates come from the activity log.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {items.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <Link href={f.href} className="truncate text-ink hover:underline">
                {f.label}
                {f.nextStep && <span className="text-ink3"> — {f.nextStep}</span>}
              </Link>
              <span className="tnum shrink-0 text-xs text-rose-600 dark:text-rose-400">{formatDate(f.nextFollowUp)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Reads a 409's duplicate list off an ApiError-like object. */
export function duplicatesOf(e: unknown): DuplicateHit[] {
  const d = (e as { duplicates?: unknown })?.duplicates;
  return Array.isArray(d) ? (d as DuplicateHit[]) : [];
}

export type PanelLead = Bant & {
  id: number;
  companyName: string;
  title: string;
  status: string;
  temperature: string;
  salesOwnerName: string | null;
  suggestedSalesName: string | null;
};

/** The Sales board's lead panel (FSD-05): the queue a head assigns from, and leads already held. */
export function SalesLeadsPanel({ queue, mine, isHead }: { queue: PanelLead[]; mine: PanelLead[]; isHead: boolean }) {
  const row = (l: PanelLead, showOwner: boolean) => (
    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
      <Link href={`/lead-records/${l.id}`} className="min-w-0 truncate text-ink hover:underline">
        {l.companyName} — {l.title}
      </Link>
      <span className="flex items-center gap-2">
        <TemperatureBadge value={l.temperature} />
        <BantTicks value={l} compact />
        {showOwner && l.salesOwnerName && <span className="text-xs text-ink3">{l.salesOwnerName}</span>}
        {!showOwner && l.suggestedSalesName && <span className="text-xs text-ink3">suggested: {l.suggestedSalesName}</span>}
        <LeadStatusBadge value={l.status} />
      </span>
    </li>
  );
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-ink">
          Sales queue <span className="text-ink3">({queue.length})</span>
        </h2>
        <p className="text-xs text-ink3">
          {isHead ? 'Handed over by Leadgen and waiting for you to assign.' : 'Handed over by Leadgen; your head assigns them.'}
        </p>
        {queue.length > 0 && <ul className="mt-2 divide-y divide-line">{queue.map((l) => row(l, false))}</ul>}
      </div>
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-ink">
          {isHead ? 'Leads with the team' : 'Leads handed to me'} <span className="text-ink3">({mine.length})</span>
        </h2>
        {mine.length === 0 ? (
          <p className="text-xs text-ink3">None yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">{mine.map((l) => row(l, isHead))}</ul>
        )}
      </div>
    </div>
  );
}
