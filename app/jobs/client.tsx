'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Briefcase, Users, Clock } from 'lucide-react';
import type { PublicJob } from '@/lib/jobs';
import { postedAgo } from '@/lib/jobs';
import {
  formatExperience,
  parseSkills,
  WORK_MODE_LABELS,
  ENGAGEMENT_LABELS,
} from '@/lib/utils';
import { Badge } from '@/components/ui';

export default function JobsClient({ jobs }: { jobs: PublicJob[] }) {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('all');

  const modes = useMemo(
    () => [...new Set(jobs.map((j) => j.workMode).filter(Boolean))] as string[],
    [jobs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (mode !== 'all' && j.workMode !== mode) return false;
      if (!q) return true;
      return [j.title, j.primarySkill, j.secondarySkill, j.location, j.company]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [jobs, search, mode]);

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      <header className="border-b border-line pb-6">
        <div className="mb-4 flex items-center gap-2 text-xs font-medium text-ink3">
          <Briefcase className="h-4 w-4" />
          Techstalwarts
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Open Roles</h1>
        <p className="mt-1 text-sm text-ink2">
          {jobs.length === 0
            ? 'No roles are open right now — do check back.'
            : `${jobs.length} role${jobs.length === 1 ? '' : 's'} we are actively hiring for.`}
        </p>
      </header>

      {jobs.length > 0 && (
        <div className="flex flex-wrap gap-2 py-5">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
            <input
              className="input pl-9"
              placeholder="Search role, skill or location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {modes.length > 1 && (
            <div className="flex rounded-md border border-line bg-surface p-0.5">
              {['all', ...modes].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    mode === m ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
                  }`}
                >
                  {m === 'all' ? 'All' : WORK_MODE_LABELS[m] ?? m}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ul className="space-y-3 pb-10">
        {filtered.map((j) => {
          const skills = parseSkills(j.otherSkills);
          return (
            <li key={j.id}>
              <Link
                href={`/jobs/${j.id}-${j.slug}`}
                className="block rounded-lg border border-line bg-surface p-4 transition-colors hover:border-brand/40 hover:bg-surface2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-ink">{j.title}</h2>
                    <p className="mt-0.5 text-sm text-ink2">{j.company}</p>
                  </div>
                  <span className="shrink-0 text-2xs text-ink3">
                    {postedAgo(j.postedAt)}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {j.primarySkill && <Badge tone="blue">{j.primarySkill}</Badge>}
                  {j.secondarySkill && <Badge tone="violet">{j.secondarySkill}</Badge>}
                  {skills.slice(0, 4).map((s) => (
                    <Badge key={s} tone="neutral">
                      {s}
                    </Badge>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink3">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatExperience(j.experienceMin, j.experienceMax)}
                  </span>
                  {j.workMode && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {WORK_MODE_LABELS[j.workMode] ?? j.workMode}
                    </span>
                  )}
                  {j.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {j.location}
                    </span>
                  )}
                  {j.openings > 1 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {j.openings} openings
                    </span>
                  )}
                  {j.engagementType && (
                    <span>{ENGAGEMENT_LABELS[j.engagementType] ?? j.engagementType}</span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}

        {jobs.length > 0 && filtered.length === 0 && (
          <li className="rounded-lg border border-dashed border-line py-10 text-center text-sm text-ink3">
            No roles match that search.
          </li>
        )}
        {jobs.length === 0 && (
          <li className="rounded-lg border border-dashed border-line py-12 text-center text-sm text-ink3">
            Nothing open at the moment.
          </li>
        )}
      </ul>

      <footer className="border-t border-line pt-6 text-2xs text-ink3">
        Techstalwarts · Roles are updated as they open and close.
      </footer>
    </div>
  );
}
