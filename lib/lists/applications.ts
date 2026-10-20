import type { ApplicationRow } from '@/lib/queries';
import { compactParams, matchesSearch, oneOf, type ListDef } from './types';

export const CONTACT_LABELS: Record<ApplicationRow['contactStatus'], string> = {
  not_contacted: 'Not called',
  attempted: 'Tried, no answer',
  reached: 'Spoke to them',
  unreachable: 'Unreachable',
};

const DECISION_LABELS: Record<ApplicationRow['status'], string> = {
  new: 'Waiting',
  accepted: 'In pool',
  dismissed: 'Dismissed',
};

export const DECISIONS = ['all', 'new', 'accepted', 'dismissed'] as const;
export const KINDS = ['all', 'application', 'referral'] as const;
const CONTACTS = ['all', 'not_contacted', 'attempted', 'reached', 'unreachable'] as const;

export type ApplicationFilters = {
  search: string;
  decision: (typeof DECISIONS)[number];
  kind: (typeof KINDS)[number];
  contact: (typeof CONTACTS)[number];
};

export const applicationsList: ListDef<ApplicationRow, ApplicationFilters> = {
  list: 'applicants',
  columns: [
    { key: 'candidateName', label: 'Candidate', value: (a) => a.candidateName, defaultOn: true },
    { key: 'candidateEmail', label: 'Email', value: (a) => a.candidateEmail, defaultOn: true },
    { key: 'candidateMobile', label: 'Mobile', value: (a) => a.candidateMobile, defaultOn: true },
    { key: 'kind', label: 'Came in as', value: (a) => (a.kind === 'application' ? 'Applied' : 'Referred'), defaultOn: true },
    { key: 'requirementTitle', label: 'Requirement', value: (a) => a.requirementTitle, defaultOn: true },
    { key: 'companyName', label: 'Company', value: (a) => a.companyName, defaultOn: true },
    { key: 'assigneeNames', label: 'Assigned TAs', value: (a) => a.assigneeNames.join('; ') },
    { key: 'status', label: 'Decision', value: (a) => DECISION_LABELS[a.status], defaultOn: true },
    { key: 'contactStatus', label: 'Call status', value: (a) => CONTACT_LABELS[a.contactStatus], defaultOn: true },
    { key: 'contactNote', label: 'Call note', value: (a) => a.contactNote },
    { key: 'lastContactedAt', label: 'Last called', value: (a) => a.lastContactedAt },
    { key: 'contactedByName', label: 'Called by', value: (a) => a.contactedByName },
    { key: 'referrerName', label: 'Referred by', value: (a) => a.referrerName },
    { key: 'referrerEmail', label: 'Referrer email', value: (a) => a.referrerEmail },
    { key: 'experienceYears', label: 'Experience (years)', value: (a) => a.experienceYears },
    { key: 'noticePeriodDays', label: 'Notice period (days)', value: (a) => a.noticePeriodDays },
    { key: 'currentCtc', label: 'Current CTC (INR)', value: (a) => a.currentCtc },
    { key: 'expectedCtc', label: 'Expected CTC (INR)', value: (a) => a.expectedCtc },
    { key: 'alreadyInPool', label: 'Already in pool', value: (a) => a.alreadyInPool },
    { key: 'otherApplications', label: 'Other applications', value: (a) => a.otherApplications },
    { key: 'notes', label: 'Notes', value: (a) => a.notes },
    { key: 'createdAt', label: 'Received on', value: (a) => a.createdAt.slice(0, 10), defaultOn: true },
  ],
  filterRows: (rows, f) =>
    rows.filter((a) => {
      if (f.decision !== 'all' && a.status !== f.decision) return false;
      if (f.kind !== 'all' && a.kind !== f.kind) return false;
      if (f.contact !== 'all' && a.contactStatus !== f.contact) return false;
      return matchesSearch(f.search, a.candidateName, a.candidateEmail, a.candidateMobile, a.requirementTitle);
    }),
  toParams: (f) =>
    compactParams(
      // Decision always sent: the screen and the server both default to 'new'.
      { search: f.search.trim(), decision: f.decision, kind: f.kind, contact: f.contact },
      { kind: 'all', contact: 'all' },
    ),
  fromParams: (p) => ({
    search: p.get('search') ?? '',
    decision: oneOf(p.get('decision'), DECISIONS, 'new'),
    kind: oneOf(p.get('kind'), KINDS, 'all'),
    contact: oneOf(p.get('contact'), CONTACTS, 'all'),
  }),
};
