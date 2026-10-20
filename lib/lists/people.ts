import type { PersonRow } from '@/lib/accounts/people';
import { ROLE_LABELS, type Role } from '@/lib/auth';
import { compactParams, matchesSearch, type ListDef } from './types';

/**
 * One wording for an account's state, used by the People screen's badge and
 * the export. Credentials and links never leave as data — only whether a
 * password exists, which Admin already sees as "Link sent".
 */
export type PersonStatus = 'deactivated' | 'ended' | 'link_sent' | 'ok';

export const PERSON_STATUS_LABELS: Record<PersonStatus, string> = {
  deactivated: 'Deactivated',
  ended: 'Access ended',
  link_sent: 'Link sent',
  ok: 'Can sign in',
};

export function personStatus(p: PersonRow): PersonStatus {
  if (!p.active) return 'deactivated';
  if (!p.canSignInNow) return 'ended';
  if (!p.hasPassword && p.linkExpiresAt) return 'link_sent';
  return 'ok';
}

export type PeopleFilters = {
  search: string;
  /** '' for every role. */
  role: Role | '';
};

export const peopleList: ListDef<PersonRow, PeopleFilters> = {
  list: 'people',
  columns: [
    { key: 'name', label: 'Name', value: (p) => p.name, defaultOn: true },
    { key: 'email', label: 'Email', value: (p) => p.email, defaultOn: true },
    { key: 'username', label: 'Username (older accounts)', value: (p) => p.username },
    { key: 'role', label: 'Role', value: (p) => ROLE_LABELS[p.role] ?? p.role, defaultOn: true },
    { key: 'isTeamLead', label: 'Head of team', value: (p) => p.isTeamLead, defaultOn: true },
    { key: 'interviewerDuty', label: 'Interviewer duty', value: (p) => p.interviewerDuty, defaultOn: true },
    { key: 'resourceName', label: 'Resource', value: (p) => p.resourceName },
    { key: 'status', label: 'Status', value: (p) => PERSON_STATUS_LABELS[personStatus(p)], defaultOn: true },
    { key: 'accessUntil', label: 'Access until', value: (p) => p.accessUntil, defaultOn: true },
    { key: 'hasPassword', label: 'Has a password', value: (p) => p.hasPassword },
    { key: 'lastSignInAt', label: 'Last sign-in (UTC)', value: (p) => p.lastSignInAt, defaultOn: true },
  ],
  filterRows: (rows, f) =>
    rows.filter((p) => {
      if (f.role && p.role !== f.role) return false;
      return matchesSearch(f.search, p.name, p.email, p.username);
    }),
  toParams: (f) => compactParams({ search: f.search.trim(), role: f.role }),
  fromParams: (p) => {
    const role = p.get('role') ?? '';
    return {
      search: p.get('search') ?? '',
      role: role in ROLE_LABELS ? (role as Role) : '',
    };
  },
};
