import type { ProjectRow } from './load/projects';
import { compactParams, matchesSearch, oneOf, type ListDef } from './types';
import { moneyColumns } from './money';

export const DEPLOYED = ['all', 'deployed', 'none'] as const;

export type ProjectFilters = {
  search: string;
  /** Client id as a string, '' for every client — the combobox's own shape. */
  client: string;
  deployed: (typeof DEPLOYED)[number];
};

export const projectsList: ListDef<ProjectRow, ProjectFilters> = {
  list: 'projects',
  columns: [
    { key: 'projectName', label: 'Project', value: (p) => p.projectName, defaultOn: true },
    { key: 'clientName', label: 'Client', value: (p) => p.clientName, defaultOn: true },
    { key: 'managerName', label: 'Manager', value: (p) => p.managerName, defaultOn: true },
    { key: 'managerEmail', label: 'Manager email', value: (p) => p.managerEmail },
    { key: 'managerMobile', label: 'Manager mobile', value: (p) => p.managerMobile },
    { key: 'managerDesignation', label: 'Manager designation', value: (p) => p.managerDesignation },
    { key: 'headcount', label: 'Deployed headcount', value: (p) => p.headcount, defaultOn: true },
    ...moneyColumns<ProjectRow>('monthlyBilling', 'Monthly billing', (p) => p.monthlyBilling, true),
  ],
  filterRows: (rows, f) =>
    rows.filter((p) => {
      if (f.client && p.clientId !== Number(f.client)) return false;
      if (f.deployed === 'deployed' && p.headcount === 0) return false;
      if (f.deployed === 'none' && p.headcount > 0) return false;
      return matchesSearch(f.search, p.projectName, p.clientName, p.managerName);
    }),
  toParams: (f) =>
    compactParams({ search: f.search.trim(), client: f.client, deployed: f.deployed }, { deployed: 'all' }),
  fromParams: (p) => ({
    search: p.get('search') ?? '',
    client: p.get('client') ?? '',
    deployed: oneOf(p.get('deployed'), DEPLOYED, 'all'),
  }),
};
