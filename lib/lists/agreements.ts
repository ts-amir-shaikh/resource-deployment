import type { AgreementRow } from './load/agreements';
import { compactParams, matchesSearch, oneOf, type ListDef } from './types';

export const AGREEMENT_STATUS_FILTER = ['all', 'active', 'expired', 'renewed'] as const;

export type AgreementFilters = {
  search: string;
  status: (typeof AGREEMENT_STATUS_FILTER)[number];
  expiringSoon: boolean;
};

export const agreementsList: ListDef<AgreementRow, AgreementFilters> = {
  list: 'agreements',
  columns: [
    { key: 'agreementNumber', label: 'PO / agreement no.', value: (a) => a.agreementNumber, defaultOn: true },
    { key: 'title', label: 'Title', value: (a) => a.title, defaultOn: true },
    { key: 'clientName', label: 'Client', value: (a) => a.clientName, defaultOn: true },
    { key: 'projectName', label: 'Project', value: (a) => a.projectName, defaultOn: true },
    { key: 'scope', label: 'Scope', value: (a) => a.scope },
    { key: 'currency', label: 'Currency', value: (a) => a.currency, defaultOn: true },
    { key: 'value', label: 'Value', value: (a) => a.value, defaultOn: true },
    { key: 'startDate', label: 'Start date', value: (a) => a.startDate, defaultOn: true },
    { key: 'endDate', label: 'End date', value: (a) => a.endDate, defaultOn: true },
    { key: 'daysToExpiry', label: 'Days to expiry', value: (a) => a.daysToExpiry },
    { key: 'renewalVersion', label: 'Version', value: (a) => a.renewalVersion },
    { key: 'status', label: 'Status', value: (a) => a.status, defaultOn: true },
    { key: 'resourceCount', label: 'Resources', value: (a) => a.resourceCount },
    { key: 'notes', label: 'Notes', value: (a) => a.notes },
  ],
  filterRows: (rows, f) =>
    rows.filter((a) => {
      if (f.status !== 'all' && a.status !== f.status) return false;
      if (
        f.expiringSoon &&
        (a.status !== 'active' || a.daysToExpiry === null || a.daysToExpiry > 30)
      )
        return false;
      return matchesSearch(f.search, a.title, a.agreementNumber, a.clientName, a.projectName);
    }),
  toParams: (f) =>
    compactParams({
      search: f.search.trim(),
      // Always sent: the screen and the server both default to 'active'.
      status: f.status,
      expiringSoon: f.expiringSoon ? '1' : null,
    }),
  fromParams: (p) => ({
    search: p.get('search') ?? '',
    status: oneOf(p.get('status'), AGREEMENT_STATUS_FILTER, 'active'),
    expiringSoon: p.get('expiringSoon') === '1',
  }),
};
