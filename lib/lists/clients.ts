import type { ClientRow } from './load/clients';
import { compactParams, matchesSearch, oneOf, type ListDef } from './types';
import { moneyColumns } from './money';

export const HAS_PROJECTS = ['all', 'with', 'without'] as const;

export type ClientFilters = {
  search: string;
  hasProjects: (typeof HAS_PROJECTS)[number];
};

export const clientsList: ListDef<ClientRow, ClientFilters> = {
  list: 'clients',
  columns: [
    { key: 'companyName', label: 'Company', value: (c) => c.companyName, defaultOn: true },
    { key: 'spocName', label: 'SPOC name', value: (c) => c.spocName, defaultOn: true },
    { key: 'spocEmail', label: 'SPOC email', value: (c) => c.spocEmail, defaultOn: true },
    { key: 'spocMobile', label: 'SPOC mobile', value: (c) => c.spocMobile },
    { key: 'spocDesignation', label: 'SPOC designation', value: (c) => c.spocDesignation },
    { key: 'accountName', label: 'Accounts contact', value: (c) => c.accountName },
    { key: 'accountEmail', label: 'Accounts email', value: (c) => c.accountEmail },
    { key: 'accountMobile', label: 'Accounts mobile', value: (c) => c.accountMobile },
    { key: 'altSpocName', label: 'Alternate SPOC', value: (c) => c.altSpocName },
    { key: 'altSpocEmail', label: 'Alternate SPOC email', value: (c) => c.altSpocEmail },
    { key: 'altSpocMobile', label: 'Alternate SPOC mobile', value: (c) => c.altSpocMobile },
    { key: 'altSpocDesignation', label: 'Alternate SPOC designation', value: (c) => c.altSpocDesignation },
    { key: 'projectCount', label: 'Projects', value: (c) => c.projectCount, defaultOn: true },
    ...moneyColumns<ClientRow>('monthlyBilling', 'Monthly billing', (c) => c.monthlyBilling, true),
    { key: 'createdAt', label: 'Added on', value: (c) => c.createdAt.slice(0, 10) },
  ],
  filterRows: (rows, f) =>
    rows.filter((c) => {
      if (f.hasProjects === 'with' && c.projectCount === 0) return false;
      if (f.hasProjects === 'without' && c.projectCount > 0) return false;
      return matchesSearch(f.search, c.companyName, c.spocName);
    }),
  toParams: (f) =>
    compactParams({ search: f.search.trim(), hasProjects: f.hasProjects }, { hasProjects: 'all' }),
  fromParams: (p) => ({
    search: p.get('search') ?? '',
    hasProjects: oneOf(p.get('hasProjects'), HAS_PROJECTS, 'all'),
  }),
};
