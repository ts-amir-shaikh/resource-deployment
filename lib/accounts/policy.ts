import { TEAM_ROLES, type Role } from '@/lib/auth';
import { isPlaceholderEmail, isUsableEmail, normaliseEmail } from './identity';

/**
 * The rules for what an account may look like and who may change it (R2–R5,
 * R20). Pure, so the People form and the API apply the same ones and a test
 * can reach every branch without a database.
 */

export type AccountDraft = {
  name: string;
  email: string | null;
  role: Role;
  isTeamLead: boolean;
  interviewerDuty: boolean;
  accessUntil: string | null;
  resourceId: number | null;
  active: boolean;
};

export type AccountRecord = AccountDraft & { id: number };

export type AccountCheck =
  | { ok: true; value: AccountDraft }
  | { ok: false; message: string; fields: Record<string, string> };

function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function checkAccount({
  input,
  current,
  actorId,
  accounts,
}: {
  input: AccountDraft;
  /** The account as stored, or null when creating one. */
  current: AccountRecord | null;
  actorId: number;
  /** Every account, active or not. */
  accounts: AccountRecord[];
}): AccountCheck {
  const fields: Record<string, string> = {};
  const others = accounts.filter((a) => a.id !== current?.id);

  // Guardrails first: they explain themselves better than a field error.
  if (current && current.role === 'admin' && current.active) {
    const demoted = input.role !== 'admin';
    const deactivated = !input.active;
    if (current.id === actorId && deactivated) {
      return { ok: false, message: 'You cannot deactivate your own account.', fields: { active: 'Not your own account' } };
    }
    if (current.id === actorId && demoted) {
      return {
        ok: false,
        message: 'You cannot remove your own Admin role. Ask another Admin to change it.',
        fields: { role: 'Not your own Admin role' },
      };
    }
    if ((demoted || deactivated) && !others.some((a) => a.role === 'admin' && a.active)) {
      return {
        ok: false,
        message: 'This is the last active Admin. Make someone else Admin first.',
        fields: demoted ? { role: 'Last active Admin' } : { active: 'Last active Admin' },
      };
    }
  }

  const name = input.name.trim();
  if (!name) fields.name = 'Enter a name';

  const rawEmail = input.email?.trim() ? normaliseEmail(input.email) : null;
  if (!rawEmail) {
    // Older accounts predate email and keep signing in by username until one
    // is added (R14). A new account, or one that already has an address, must
    // have one: clearing it would quietly switch username sign-in back on.
    if (!current || (current.email && isUsableEmail(current.email))) fields.email = 'Enter an email address';
  } else if (isPlaceholderEmail(rawEmail)) {
    fields.email = "This is a placeholder address. Enter the person's real email.";
  } else if (!isUsableEmail(rawEmail)) {
    fields.email = 'Enter a valid email address';
  } else if (others.some((a) => a.email && normaliseEmail(a.email) === rawEmail)) {
    fields.email = 'Another account already uses this email';
  }

  const role = input.role;
  const isTeamLead = TEAM_ROLES.includes(role) ? input.isTeamLead : false;

  // An Interviewer-role account is the outside panellist (R4); duty is how an
  // internal account joins a panel with its own login.
  if (role === 'interviewer' && input.interviewerDuty) {
    fields.interviewerDuty = 'Outside interviewers already sit on panels. Duty is for internal accounts.';
  }

  const accessUntil = input.accessUntil?.trim() || null;
  if (accessUntil && !isCalendarDate(accessUntil)) fields.accessUntil = 'Enter a date';
  if (role === 'interviewer' && !accessUntil) {
    fields.accessUntil = 'Outside interviewers need a last day of access';
  }

  let resourceId: number | null = null;
  if (role === 'resource') {
    resourceId = input.resourceId;
    if (!resourceId) fields.resourceId = 'Pick the resource this login belongs to';
    else if (others.some((a) => a.resourceId === resourceId)) {
      fields.resourceId = 'This resource already has a login';
    }
  }

  if (Object.keys(fields).length) {
    return { ok: false, message: 'Please correct the highlighted fields', fields };
  }
  return {
    ok: true,
    value: {
      name,
      email: rawEmail,
      role,
      isTeamLead,
      interviewerDuty: input.interviewerDuty,
      accessUntil,
      resourceId,
      active: input.active,
    },
  };
}

/** Changes that must reach the person on their next request (R16, KTD1). */
const SESSION_FIELDS = ['role', 'isTeamLead', 'interviewerDuty', 'email', 'active'] as const;

export function needsNewSession(before: AccountDraft, after: AccountDraft): boolean {
  return SESSION_FIELDS.some((k) => before[k] !== after[k]);
}

const LOGGED_FIELDS = ['name', 'email', 'role', 'isTeamLead', 'interviewerDuty', 'accessUntil', 'resourceId'] as const;

/** Before-and-after for each field the edit changed (R19). */
export function changedFields(before: AccountDraft, after: AccountDraft) {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of LOGGED_FIELDS) {
    if (before[k] !== after[k]) out[k] = { before: before[k], after: after[k] };
  }
  return out;
}
