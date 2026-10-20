import type { ResourceRow } from './load/resources';
import { compactParams, matchesSearch, oneOf, type ListDef } from './types';
import { parseSkills } from '@/lib/utils';

export const AVAILABILITY = ['all', 'available', 'partial', 'full'] as const;

export type ResourceFilters = {
  search: string;
  skill: string | null;
  availability: (typeof AVAILABILITY)[number];
};

export const resourcesList: ListDef<ResourceRow, ResourceFilters> = {
  list: 'resources',
  columns: [
    { key: 'name', label: 'Name', value: (r) => r.name, defaultOn: true },
    { key: 'email', label: 'Email', value: (r) => r.email, defaultOn: true },
    { key: 'mobile', label: 'Mobile', value: (r) => r.mobile },
    { key: 'designation', label: 'Designation', value: (r) => r.designation, defaultOn: true },
    { key: 'primarySkill', label: 'Primary skill', value: (r) => r.primarySkill, defaultOn: true },
    { key: 'secondarySkill', label: 'Secondary skill', value: (r) => r.secondarySkill },
    { key: 'otherSkills', label: 'Other skills', value: (r) => parseSkills(r.otherSkills).join('; ') },
    { key: 'currentCtc', label: 'Current CTC (INR)', value: (r) => r.currentCtc, defaultOn: true },
    { key: 'revisedCtc', label: 'Revised CTC (INR)', value: (r) => r.revisedCtc },
    { key: 'revisedEffectiveFrom', label: 'Revised CTC from', value: (r) => r.revisedEffectiveFrom },
    { key: 'billable', label: 'Billable allocation %', value: (r) => r.billable, defaultOn: true },
    { key: 'shadow', label: 'Shadow allocation %', value: (r) => r.shadow, defaultOn: true },
    { key: 'allocated', label: 'Total allocation %', value: (r) => r.allocated },
    { key: 'createdAt', label: 'Added on', value: (r) => r.createdAt.slice(0, 10) },
  ],
  filterRows: (rows, f) =>
    rows.filter((r) => {
      if (f.skill && r.primarySkill !== f.skill) return false;
      if (f.availability === 'available' && r.allocated !== 0) return false;
      if (f.availability === 'full' && r.allocated < 100) return false;
      if (f.availability === 'partial' && (r.allocated === 0 || r.allocated >= 100)) return false;
      return matchesSearch(f.search, r.name, r.email, r.designation, r.primarySkill);
    }),
  toParams: (f) =>
    compactParams({ search: f.search.trim(), skill: f.skill, availability: f.availability }, { availability: 'all' }),
  fromParams: (p) => ({
    search: p.get('search') ?? '',
    skill: p.get('skill') || null,
    availability: oneOf(p.get('availability'), AVAILABILITY, 'all'),
  }),
};
