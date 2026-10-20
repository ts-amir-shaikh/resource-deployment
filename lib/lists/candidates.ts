import type { CandidateRow } from './load/candidates';
import { compactParams, matchesSearch, oneOf, type ListDef } from './types';
import { CANDIDATE_SOURCE_VALUES, SOURCE_LABELS, parseSkills } from '@/lib/utils';

const SOURCE_FILTER = ['all', ...CANDIDATE_SOURCE_VALUES] as const;

export type CandidateFilters = {
  search: string;
  source: (typeof SOURCE_FILTER)[number];
  skill: string | null;
};

export const candidatesList: ListDef<CandidateRow, CandidateFilters> = {
  list: 'candidates',
  columns: [
    { key: 'name', label: 'Name', value: (c) => c.name, defaultOn: true },
    { key: 'email', label: 'Email', value: (c) => c.email, defaultOn: true },
    { key: 'mobile', label: 'Mobile', value: (c) => c.mobile, defaultOn: true },
    { key: 'currentDesignation', label: 'Current designation', value: (c) => c.currentDesignation, defaultOn: true },
    { key: 'experienceYears', label: 'Experience (years)', value: (c) => c.experienceYears, defaultOn: true },
    { key: 'primarySkill', label: 'Primary skill', value: (c) => c.primarySkill, defaultOn: true },
    { key: 'secondarySkill', label: 'Secondary skill', value: (c) => c.secondarySkill },
    { key: 'otherSkills', label: 'Other skills', value: (c) => parseSkills(c.otherSkills).join('; ') },
    { key: 'currentCtc', label: 'Current CTC (INR)', value: (c) => c.currentCtc },
    { key: 'expectedCtc', label: 'Expected CTC (INR)', value: (c) => c.expectedCtc },
    { key: 'noticePeriodDays', label: 'Notice period (days)', value: (c) => c.noticePeriodDays, defaultOn: true },
    { key: 'lastWorkingDate', label: 'Last working date', value: (c) => c.lastWorkingDate },
    { key: 'location', label: 'Location', value: (c) => c.location, defaultOn: true },
    { key: 'source', label: 'Source', value: (c) => SOURCE_LABELS[c.source] ?? c.source, defaultOn: true },
    { key: 'sourceName', label: 'Source name', value: (c) => c.sourceName },
    { key: 'resumeUrl', label: 'Resume link', value: (c) => c.resumeUrl },
    { key: 'mappedCount', label: 'Requirements mapped', value: (c) => c.mappedCount },
    { key: 'activeCount', label: 'Active mappings', value: (c) => c.activeCount },
    { key: 'notes', label: 'Notes', value: (c) => c.notes },
    { key: 'createdAt', label: 'Added on', value: (c) => c.createdAt.slice(0, 10) },
  ],
  filterRows: (rows, f) =>
    rows.filter((c) => {
      if (f.source !== 'all' && c.source !== f.source) return false;
      if (f.skill && c.primarySkill !== f.skill) return false;
      return matchesSearch(f.search, c.name, c.primarySkill, c.currentDesignation, c.sourceName);
    }),
  toParams: (f) =>
    compactParams({ search: f.search.trim(), source: f.source, skill: f.skill }, { source: 'all' }),
  fromParams: (p) => ({
    search: p.get('search') ?? '',
    source: oneOf(p.get('source'), SOURCE_FILTER, 'all'),
    skill: p.get('skill') || null,
  }),
};
