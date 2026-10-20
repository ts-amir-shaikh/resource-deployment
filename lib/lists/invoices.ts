import type { InvoiceRow } from './load/invoices';
import { compactParams, matchesSearch, oneOf, type ListDef } from './types';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_ORDER } from '@/lib/utils';

const STATUS_FILTER = ['all', ...INVOICE_STATUS_ORDER] as const;

export type InvoiceFilters = {
  search: string;
  status: string;
  overdue: boolean;
  /** Client name, '' for every client. */
  client: string;
};

export const invoicesList: ListDef<InvoiceRow, InvoiceFilters> = {
  list: 'invoices',
  columns: [
    { key: 'invoiceNumber', label: 'Invoice no.', value: (i) => i.invoiceNumber, defaultOn: true },
    { key: 'clientName', label: 'Client', value: (i) => i.clientName, defaultOn: true },
    { key: 'projectName', label: 'Project', value: (i) => i.projectName, defaultOn: true },
    { key: 'agreementNumber', label: 'PO / agreement no.', value: (i) => i.agreementNumber },
    { key: 'agreementTitle', label: 'Agreement', value: (i) => i.agreementTitle },
    { key: 'scope', label: 'Scope', value: (i) => i.scope },
    { key: 'periodFrom', label: 'Period from', value: (i) => i.periodFrom, defaultOn: true },
    { key: 'periodTo', label: 'Period to', value: (i) => i.periodTo, defaultOn: true },
    { key: 'currency', label: 'Currency', value: (i) => i.currency, defaultOn: true },
    { key: 'amount', label: 'Amount', value: (i) => i.amount, defaultOn: true },
    { key: 'gstAmount', label: 'GST', value: (i) => i.gstAmount, defaultOn: true },
    { key: 'totalAmount', label: 'Total', value: (i) => i.totalAmount, defaultOn: true },
    { key: 'fxRateToInr', label: 'FX rate to INR', value: (i) => i.fxRateToInr },
    { key: 'invoiceDate', label: 'Invoice date', value: (i) => i.invoiceDate },
    { key: 'dueDate', label: 'Due date', value: (i) => i.dueDate, defaultOn: true },
    { key: 'collectedDate', label: 'Collected on', value: (i) => i.collectedDate },
    {
      key: 'status',
      label: 'Status',
      value: (i) => INVOICE_STATUS_LABELS[i.status] ?? i.status,
      defaultOn: true,
    },
    { key: 'overdue', label: 'Overdue', value: (i) => i.overdue, defaultOn: true },
    { key: 'notes', label: 'Notes', value: (i) => i.notes },
  ],
  filterRows: (rows, f) =>
    rows.filter((i) => {
      if (f.status !== 'all' && i.status !== f.status) return false;
      if (f.overdue && !i.overdue) return false;
      if (f.client && i.clientName !== f.client) return false;
      return matchesSearch(f.search, i.invoiceNumber, i.clientName, i.projectName);
    }),
  toParams: (f) =>
    compactParams(
      { search: f.search.trim(), status: f.status, overdue: f.overdue ? '1' : null, client: f.client },
      { status: 'all' },
    ),
  fromParams: (p) => ({
    search: p.get('search') ?? '',
    status: oneOf(p.get('status'), STATUS_FILTER, 'all'),
    overdue: p.get('overdue') === '1',
    client: p.get('client') ?? '',
  }),
};
