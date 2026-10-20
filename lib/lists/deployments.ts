import type { DeploymentRow } from './load/deployments';
import { compactParams, matchesSearch, oneOf, type ListDef } from './types';
import { GST_RATE } from '@/lib/utils';

export const DEPLOYMENT_STATUS_FILTER = ['all', 'active', 'ended'] as const;
export const DEPLOYMENT_TYPE_FILTER = ['all', 'billable', 'shadow'] as const;

export type DeploymentFilters = {
  search: string;
  status: (typeof DEPLOYMENT_STATUS_FILTER)[number];
  type: (typeof DEPLOYMENT_TYPE_FILTER)[number];
  /** Client name, '' for every client. */
  client: string;
};

export const deploymentsList: ListDef<DeploymentRow, DeploymentFilters> = {
  list: 'deployments',
  columns: [
    { key: 'resourceName', label: 'Resource', value: (d) => d.resourceName, defaultOn: true },
    { key: 'designation', label: 'Designation', value: (d) => d.designation },
    { key: 'clientName', label: 'Client', value: (d) => d.clientName, defaultOn: true },
    { key: 'projectName', label: 'Project', value: (d) => d.projectName, defaultOn: true },
    { key: 'agreementNumber', label: 'PO / agreement no.', value: (d) => d.agreementNumber },
    { key: 'agreementTitle', label: 'Agreement', value: (d) => d.agreementTitle },
    { key: 'deploymentType', label: 'Type', value: (d) => d.deploymentType, defaultOn: true },
    { key: 'allocationPercentage', label: 'Allocation %', value: (d) => d.allocationPercentage, defaultOn: true },
    { key: 'startDate', label: 'Start date', value: (d) => d.startDate, defaultOn: true },
    { key: 'endDate', label: 'End date', value: (d) => d.endDate, defaultOn: true },
    { key: 'status', label: 'Status', value: (d) => d.status, defaultOn: true },
    { key: 'currency', label: 'Currency', value: (d) => d.currency, defaultOn: true },
    { key: 'billingAmount', label: 'Monthly billing', value: (d) => d.billingAmount, defaultOn: true },
    { key: 'gstApplicable', label: 'GST applicable', value: (d) => d.gstApplicable },
    { key: 'gstAmount', label: 'GST', value: (d) => (d.gstApplicable ? d.billingAmount * GST_RATE : 0) },
    { key: 'commissionAmount', label: 'Commission', value: (d) => d.commissionAmount },
    { key: 'operationsOverhead', label: 'Operations overhead', value: (d) => d.operationsOverhead },
  ],
  filterRows: (rows, f) =>
    rows.filter((d) => {
      if (f.status !== 'all' && d.status !== f.status) return false;
      if (f.type !== 'all' && d.deploymentType !== f.type) return false;
      if (f.client && d.clientName !== f.client) return false;
      return matchesSearch(f.search, d.resourceName, d.projectName, d.clientName);
    }),
  toParams: (f) =>
    compactParams(
      { search: f.search.trim(), status: f.status, type: f.type, client: f.client },
      // No default for status: the screen opens on 'active' and the server
      // reads a missing status as 'active' too, so 'all' must always be sent.
      { type: 'all' },
    ),
  fromParams: (p) => ({
    search: p.get('search') ?? '',
    status: oneOf(p.get('status'), DEPLOYMENT_STATUS_FILTER, 'active'),
    type: oneOf(p.get('type'), DEPLOYMENT_TYPE_FILTER, 'all'),
    client: p.get('client') ?? '',
  }),
};
