import { notFound } from 'next/navigation';
import Link from 'next/link';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { FileText, Link2 } from 'lucide-react';
import { db } from '@/lib/db';
import {
  candidates,
  candidateInterviews,
  candidateRatings,
  interviewPanel,
  opportunities,
  opportunityCandidates,
  ratingCriteria,
  referrals,
  resources,
  users,
} from '@/lib/schema';
import { requireSession } from '@/lib/session';
import {
  formatDate,
  parseSkills,
  availabilityLabel,
  SOURCE_LABELS,
  STAGE_LABELS,
  CANDIDATE_STATUS_LABELS,
} from '@/lib/utils';
import { Badge, TableShell, type Tone } from '@/components/ui';
import {
  DetailHeader,
  DetailSection,
  DetailFacts,
  DetailEmpty,
  AnnualWithMonthly,
} from '@/components/detail';

export const dynamic = 'force-dynamic';

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

const OUTCOME_TONE: Record<string, Tone> = {
  pass: 'green',
  fail: 'rose',
  hold: 'amber',
  no_show: 'neutral',
};

const OUTCOME_LABELS: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  hold: 'On hold',
  no_show: 'No show',
};

const MODE_LABELS: Record<string, string> = {
  internal_screening: 'Internal screening',
  client_round: 'Client round',
  final: 'Final round',
};

/**
 * Everything known about one person, in one place.
 *
 * The only entity that had no page of its own: a candidate was a row in a
 * list and whatever could be read sideways from the requirements they were
 * mapped to. After Phase 9 there is a real history to show — rounds, panels,
 * outcomes, scores — and it is grouped under the requirement each belongs to
 * rather than flattened into one timeline. The same person is routinely strong
 * for one brief and weak for another, and a single chronological list would
 * hide exactly that.
 *
 * Expected billing on a mapping is deliberately not shown here. It is visible
 * on the requirement page to every role today, but that is an existing
 * decision under review, and a new surface should not widen it.
 */
export default async function CandidateDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const { role } = await requireSession();
  const author = alias(users, 'author');
  const decider = alias(users, 'decider');

  const [row, mappings, origins] = await Promise.all([
    db
      .select({
        id: candidates.id,
        name: candidates.name,
        email: candidates.email,
        mobile: candidates.mobile,
        currentDesignation: candidates.currentDesignation,
        experienceYears: candidates.experienceYears,
        primarySkill: candidates.primarySkill,
        secondarySkill: candidates.secondarySkill,
        otherSkills: candidates.otherSkills,
        currentCtc: candidates.currentCtc,
        expectedCtc: candidates.expectedCtc,
        noticePeriodDays: candidates.noticePeriodDays,
        lastWorkingDate: candidates.lastWorkingDate,
        location: candidates.location,
        resumeUrl: candidates.resumeUrl,
        source: candidates.source,
        sourceName: candidates.sourceName,
        notes: candidates.notes,
        createdAt: candidates.createdAt,
        resourceId: candidates.resourceId,
        resourceName: resources.name,
        addedBy: author.name,
      })
      .from(candidates)
      .leftJoin(resources, eq(candidates.resourceId, resources.id))
      .leftJoin(author, eq(candidates.createdByUserId, author.id))
      .where(eq(candidates.id, id))
      .get(),
    db
      .select({
        id: opportunityCandidates.id,
        opportunityId: opportunityCandidates.opportunityId,
        status: opportunityCandidates.status,
        interviewRound: opportunityCandidates.interviewRound,
        interviewDate: opportunityCandidates.interviewDate,
        mappedAt: opportunityCandidates.createdAt,
        title: opportunities.title,
        companyName: opportunities.companyName,
        stage: opportunities.stage,
        mappedBy: author.name,
      })
      .from(opportunityCandidates)
      .innerJoin(opportunities, eq(opportunityCandidates.opportunityId, opportunities.id))
      .leftJoin(author, eq(opportunityCandidates.userId, author.id))
      .where(eq(opportunityCandidates.candidateId, id))
      .orderBy(desc(opportunityCandidates.id))
      .all(),
    // How they got here, if it was through the job board or a referral.
    db
      .select({
        id: referrals.id,
        kind: referrals.kind,
        referrerName: referrals.referrerName,
        opportunityId: referrals.opportunityId,
        title: opportunities.title,
        createdAt: referrals.createdAt,
        approvedBy: decider.name,
      })
      .from(referrals)
      .innerJoin(opportunities, eq(referrals.opportunityId, opportunities.id))
      .leftJoin(decider, eq(referrals.decidedByUserId, decider.id))
      .where(eq(referrals.convertedCandidateId, id))
      .all(),
  ]);

  if (!row) notFound();

  // Rounds, panels and scores for every mapping in one pass each, keyed back
  // by mapping id — a candidate on four requirements would otherwise cost
  // twelve queries to render.
  const mappingIds = mappings.map((m) => m.id);
  const [rounds, panels, scores] = mappingIds.length
    ? await Promise.all([
        db
          .select()
          .from(candidateInterviews)
          .where(inArray(candidateInterviews.opportunityCandidateId, mappingIds))
          .orderBy(desc(candidateInterviews.round), desc(candidateInterviews.id))
          .all(),
        db
          .select({
            interviewId: interviewPanel.interviewId,
            name: interviewPanel.name,
            designation: interviewPanel.designation,
          })
          .from(interviewPanel)
          .innerJoin(candidateInterviews, eq(interviewPanel.interviewId, candidateInterviews.id))
          .where(inArray(candidateInterviews.opportunityCandidateId, mappingIds))
          .orderBy(asc(interviewPanel.id))
          .all(),
        db
          .select({
            mappingId: candidateRatings.opportunityCandidateId,
            interviewId: candidateRatings.interviewId,
            score: candidateRatings.score,
            note: candidateRatings.note,
            label: ratingCriteria.label,
          })
          .from(candidateRatings)
          .innerJoin(ratingCriteria, eq(candidateRatings.criterionId, ratingCriteria.id))
          .where(inArray(candidateRatings.opportunityCandidateId, mappingIds))
          .orderBy(asc(ratingCriteria.sortOrder), asc(ratingCriteria.id))
          .all(),
      ])
    : [[], [], []];

  const skills = parseSkills(row.otherSkills);
  const live = mappings.filter((m) => !['rejected', 'withdrawn', 'joined'].includes(m.status));
  const joined = mappings.filter((m) => m.status === 'joined');

  return (
    <div className="pb-12">
      <DetailHeader
        backHref="/candidates"
        backLabel="Back to candidates"
        title={row.name}
        subtitle={
          [row.currentDesignation, row.experienceYears != null && `${row.experienceYears} yrs`, row.location]
            .filter(Boolean)
            .join(' · ') || 'No designation recorded'
        }
        badges={
          <>
            <Badge tone="neutral">
              {SOURCE_LABELS[row.source]}
              {row.sourceName ? ` · ${row.sourceName}` : ''}
            </Badge>
            {joined.length > 0 && <Badge tone="green">Joined</Badge>}
            {joined.length === 0 && live.length > 0 && (
              <Badge tone="blue">{live.length} live</Badge>
            )}
          </>
        }
        actions={
          <>
            {row.resumeUrl && (
              <a
                href={row.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                <FileText className="h-3.5 w-3.5" /> Open resume
              </a>
            )}
            {row.resourceId && (
              <Link href={`/resources/${row.resourceId}`} className="btn-ghost">
                <Link2 className="h-3.5 w-3.5" /> Bench record
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection title="Profile">
            <DetailFacts
              facts={[
                [
                  'Email',
                  row.email ? (
                    <a key="e" href={`mailto:${row.email}`} className="text-brand hover:underline">
                      {row.email}
                    </a>
                  ) : null,
                ],
                ['Mobile', row.mobile],
                ['Location', row.location],
                ['Primary Skill', row.primarySkill],
                ['Secondary Skill', row.secondarySkill],
                [
                  'Other Skills',
                  skills.length ? (
                    <span key="s" className="flex flex-wrap gap-1">
                      {skills.map((sk) => (
                        <Badge key={sk} tone="neutral">
                          {sk}
                        </Badge>
                      ))}
                    </span>
                  ) : null,
                ],
                ['Current CTC', row.currentCtc == null ? null : <AnnualWithMonthly key="c" annual={row.currentCtc} />],
                ['Expected CTC', row.expectedCtc == null ? null : <AnnualWithMonthly key="e" annual={row.expectedCtc} />],
                ['Availability', availabilityLabel(row.lastWorkingDate, row.noticePeriodDays)],
                [
                  'Notice / LWD',
                  [
                    row.noticePeriodDays != null && `${row.noticePeriodDays} days`,
                    row.lastWorkingDate && `LWD ${formatDate(row.lastWorkingDate)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || null,
                ],
                ['Added by', row.addedBy ?? null],
                ['Added on', formatDate(row.createdAt.slice(0, 10))],
              ]}
            />
            {row.notes && (
              <p className="whitespace-pre-wrap border-t border-line px-4 py-3 text-sm leading-relaxed text-ink2">
                {row.notes}
              </p>
            )}
          </DetailSection>

          <DetailSection
            title="Requirements"
            count={mappings.length}
            hint="Every requirement this person has been put forward for, newest first"
          >
            {mappings.length === 0 ? (
              <DetailEmpty>Not yet mapped to any requirement.</DetailEmpty>
            ) : (
              <TableShell>
                <thead className="border-b border-line bg-surface2">
                  <tr>
                    <th className="th">Requirement</th>
                    <th className="th">Status</th>
                    <th className="th">Rounds</th>
                    <th className="th">Mapped</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mappings.map((m) => {
                    const n = rounds.filter((r) => r.opportunityCandidateId === m.id).length;
                    return (
                      <tr key={m.id} className="hover:bg-surface2/50">
                        <td className="td">
                          <Link
                            href={`/pipeline/${m.opportunityId}`}
                            className="font-medium text-ink hover:text-brand"
                          >
                            {m.title}
                          </Link>
                          <div className="text-2xs text-ink3">
                            {m.companyName} · {STAGE_LABELS[m.stage] ?? m.stage}
                          </div>
                        </td>
                        <td className="td">
                          <Badge tone={STATUS_TONE[m.status]}>
                            {CANDIDATE_STATUS_LABELS[m.status]}
                          </Badge>
                        </td>
                        <td className="td tnum text-ink2">{n === 0 ? '—' : n}</td>
                        <td className="td">
                          <div className="tnum text-ink2">{formatDate(m.mappedAt.slice(0, 10))}</div>
                          {m.mappedBy && <div className="text-2xs text-ink3">by {m.mappedBy}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableShell>
            )}
          </DetailSection>

          {/* Interviews, grouped under the requirement they belong to. */}
          {mappings
            .filter((m) => rounds.some((r) => r.opportunityCandidateId === m.id))
            .map((m) => {
              const mine = rounds.filter((r) => r.opportunityCandidateId === m.id);
              const profileScores = scores.filter(
                (s) => s.mappingId === m.id && s.interviewId === null,
              );
              return (
                <DetailSection
                  key={m.id}
                  title={`Interviews · ${m.title}`}
                  count={mine.length}
                  hint={m.companyName}
                >
                  <ul className="divide-y divide-line">
                    {mine.map((r) => {
                      const panel = panels.filter((p) => p.interviewId === r.id);
                      const roundScores = scores.filter((s) => s.interviewId === r.id);
                      return (
                        <li key={r.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-ink">Round {r.round}</span>
                            <Badge tone="neutral">{MODE_LABELS[r.mode] ?? r.mode}</Badge>
                            {r.outcome ? (
                              <Badge tone={OUTCOME_TONE[r.outcome]}>{OUTCOME_LABELS[r.outcome]}</Badge>
                            ) : (
                              <Badge tone="blue">Scheduled</Badge>
                            )}
                            <span className="tnum ml-auto text-2xs text-ink3">
                              {formatDate(r.heldAt ?? r.scheduledAt)}
                            </span>
                          </div>
                          {panel.length > 0 && (
                            <div className="mt-1 text-2xs text-ink3">
                              Panel:{' '}
                              {panel
                                .map((p) => p.name + (p.designation ? ` (${p.designation})` : ''))
                                .join(', ')}
                            </div>
                          )}
                          {r.feedback && (
                            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink2">
                              {r.feedback}
                            </p>
                          )}
                          {r.recommendation && (
                            <p className="mt-1 text-xs italic text-ink3">
                              Recommendation: {r.recommendation}
                            </p>
                          )}
                          {r.questionsAsked && (
                            <p className="mt-1 whitespace-pre-wrap text-xs text-ink3">
                              Asked: {r.questionsAsked}
                            </p>
                          )}
                          {roundScores.length > 0 && <ScoreRow scores={roundScores} />}
                        </li>
                      );
                    })}
                  </ul>
                  {profileScores.length > 0 && (
                    <div className="border-t border-line px-4 py-3">
                      <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink3">
                        Recruiter evaluation
                      </div>
                      <ScoreRow scores={profileScores} />
                    </div>
                  )}
                </DetailSection>
              );
            })}

          {/* Evaluations recorded without any interview rounds behind them. */}
          {mappings
            .filter(
              (m) =>
                !rounds.some((r) => r.opportunityCandidateId === m.id) &&
                scores.some((s) => s.mappingId === m.id),
            )
            .map((m) => (
              <DetailSection key={`ev-${m.id}`} title={`Evaluation · ${m.title}`} hint={m.companyName}>
                <div className="px-4 py-3">
                  <ScoreRow scores={scores.filter((s) => s.mappingId === m.id)} />
                </div>
              </DetailSection>
            ))}
        </div>

        <div className="space-y-6">
          <DetailSection title="Where they came from">
            {origins.length === 0 ? (
              <DetailEmpty>
                {row.addedBy
                  ? `Added directly by ${row.addedBy}.`
                  : 'Added directly; no application or referral on record.'}
              </DetailEmpty>
            ) : (
              <ul className="divide-y divide-line">
                {origins.map((o) => (
                  <li key={o.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {o.kind === 'application' ? (
                        <Badge tone="blue">Applied</Badge>
                      ) : (
                        <Badge tone="violet">Referred</Badge>
                      )}
                      <span className="tnum text-2xs text-ink3">
                        {formatDate(o.createdAt.slice(0, 10))}
                      </span>
                    </div>
                    <div className="mt-1 text-ink2">
                      for{' '}
                      <Link href={`/pipeline/${o.opportunityId}`} className="text-brand hover:underline">
                        {o.title}
                      </Link>
                    </div>
                    {o.kind === 'referral' && (
                      <div className="text-2xs text-ink3">Referred by {o.referrerName}</div>
                    )}
                    {o.approvedBy && (
                      <div className="text-2xs text-ink3">Approved into the pool by {o.approvedBy}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection title="At a glance">
            <DetailFacts
              columns={2}
              facts={[
                ['Requirements', String(mappings.length)],
                ['Live', String(live.length)],
                ['Rounds sat', String(rounds.length)],
                ['Outcomes', rounds.filter((r) => r.outcome).length ? `${rounds.filter((r) => r.outcome === 'pass').length} pass · ${rounds.filter((r) => r.outcome === 'fail').length} fail` : null],
              ]}
            />
          </DetailSection>

          {role !== 'management' && (
            <p className="px-1 text-2xs text-ink3">
              Edit the profile from the candidate list. Interview rounds and evaluations are
              recorded on the requirement they belong to.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pointer scores as a compact strip, with the average alongside — never instead of — them. */
function ScoreRow({ scores }: { scores: { label: string; score: number; note: string | null }[] }) {
  const avg = scores.reduce((n, s) => n + s.score, 0) / scores.length;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {scores.map((s, i) => (
        <span
          key={`${s.label}-${i}`}
          title={s.note ?? undefined}
          className="rounded border border-line bg-surface2 px-1.5 py-0.5 text-2xs text-ink2"
        >
          {s.label} <span className="tnum font-semibold text-ink">{s.score}</span>
        </span>
      ))}
      <span className="tnum ml-1 text-2xs text-ink3">avg {avg.toFixed(1)}</span>
    </div>
  );
}
