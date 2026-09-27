import { describe, expect, it } from 'vitest';
import { checkAccount, changedFields, needsNewSession, type AccountDraft, type AccountRecord } from './policy';

function draft(over: Partial<AccountDraft> = {}): AccountDraft {
  return {
    name: 'Priya Nair',
    email: 'priya@techstalwarts.com',
    role: 'ta',
    isTeamLead: false,
    interviewerDuty: false,
    accessUntil: null,
    resourceId: null,
    active: true,
    ...over,
  };
}

function record(id: number, over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id,
    name: `User ${id}`,
    email: `user${id}@techstalwarts.com`,
    role: 'ta',
    isTeamLead: false,
    interviewerDuty: false,
    accessUntil: null,
    resourceId: null,
    active: true,
    ...over,
  };
}

const admin = record(1, { role: 'admin', email: 'admin@techstalwarts.com' });

function check(input: AccountDraft, opts: { current?: AccountRecord | null; actorId?: number; accounts?: AccountRecord[] } = {}) {
  return checkAccount({
    input,
    current: opts.current ?? null,
    actorId: opts.actorId ?? admin.id,
    accounts: opts.accounts ?? [admin],
  });
}

function errorsOf(r: ReturnType<typeof checkAccount>) {
  return r.ok ? {} : r.fields;
}

describe('the account form rules (R2–R5)', () => {
  it('a plain TA account passes, with the email stored lower-case', () => {
    const r = check(draft({ email: ' Priya@TechStalwarts.com ' }));
    expect(r.ok && r.value.email).toBe('priya@techstalwarts.com');
  });

  it('a new account needs an email', () => {
    expect(errorsOf(check(draft({ email: null })))).toHaveProperty('email');
    expect(errorsOf(check(draft({ email: '  ' })))).toHaveProperty('email');
  });

  it('Covers AE5. a placeholder address is refused', () => {
    expect(errorsOf(check(draft({ email: 'priya.nair@placeholder.local' })))).toHaveProperty('email');
  });

  it('a duplicate email in different case is refused', () => {
    const other = record(2, { email: 'priya@techstalwarts.com' });
    expect(errorsOf(check(draft({ email: 'PRIYA@techstalwarts.com' }), { accounts: [admin, other] }))).toHaveProperty(
      'email',
    );
  });

  it('keeping your own email on an edit is not a duplicate', () => {
    const me = record(2, { email: 'priya@techstalwarts.com' });
    expect(check(draft(), { current: me, accounts: [admin, me] }).ok).toBe(true);
  });

  it('an older account may stay without an email, but a set email cannot be removed', () => {
    const legacy = record(2, { email: null });
    expect(check(draft({ email: null }), { current: legacy, accounts: [admin, legacy] }).ok).toBe(true);
    const withEmail = record(3);
    expect(errorsOf(check(draft({ email: null }), { current: withEmail, accounts: [admin, withEmail] }))).toHaveProperty(
      'email',
    );
  });

  it('a Resource account without a resource link is refused', () => {
    expect(errorsOf(check(draft({ role: 'resource' })))).toHaveProperty('resourceId');
  });

  it('a resource already linked to another account is refused', () => {
    const linked = record(2, { role: 'resource', resourceId: 40 });
    expect(
      errorsOf(check(draft({ role: 'resource', resourceId: 40 }), { accounts: [admin, linked] })),
    ).toHaveProperty('resourceId');
  });

  it('a Resource account linked to a free resource passes', () => {
    expect(check(draft({ role: 'resource', resourceId: 41 })).ok).toBe(true);
  });

  it('a resource link on any other role is dropped', () => {
    const r = check(draft({ role: 'ta', resourceId: 41 }));
    expect(r.ok && r.value.resourceId).toBeNull();
  });

  it('an Interviewer account without access-until is refused', () => {
    expect(errorsOf(check(draft({ role: 'interviewer' })))).toHaveProperty('accessUntil');
  });

  it('an Interviewer account with access-until passes', () => {
    expect(check(draft({ role: 'interviewer', accessUntil: '2026-10-31' })).ok).toBe(true);
  });

  it('a malformed access-until date is refused', () => {
    expect(errorsOf(check(draft({ accessUntil: '31/10/2026' })))).toHaveProperty('accessUntil');
    expect(errorsOf(check(draft({ accessUntil: '2026-02-30' })))).toHaveProperty('accessUntil');
  });

  it('interviewer duty on an Interviewer-role account is refused', () => {
    expect(
      errorsOf(check(draft({ role: 'interviewer', accessUntil: '2026-10-31', interviewerDuty: true }))),
    ).toHaveProperty('interviewerDuty');
  });

  it('the head flag only sticks on TA, Lead Generation and Sales', () => {
    const ta = check(draft({ role: 'ta', isTeamLead: true }));
    expect(ta.ok && ta.value.isTeamLead).toBe(true);
    const mgmt = check(draft({ role: 'management', isTeamLead: true }));
    expect(mgmt.ok && mgmt.value.isTeamLead).toBe(false);
  });
});

describe('the Admin guardrails (R20)', () => {
  const second = record(2, { role: 'admin', email: 'second@techstalwarts.com' });

  it('Covers AE7. the only active Admin changing their own role is refused, with the reason', () => {
    const r = check(draft({ ...admin, role: 'management' }), { current: admin, actorId: admin.id });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/own Admin role/);
  });

  it('Admin removing their own Admin role is refused even when another Admin exists', () => {
    const r = check(draft({ ...admin, role: 'management' }), {
      current: admin,
      actorId: admin.id,
      accounts: [admin, second],
    });
    expect(r.ok).toBe(false);
  });

  it('Admin deactivating their own account is refused', () => {
    const r = check(draft({ ...admin, active: false }), { current: admin, actorId: admin.id, accounts: [admin, second] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/your own account/);
  });

  it('a second active Admin allows the first to be demoted', () => {
    const r = check(draft({ ...admin, role: 'management' }), {
      current: admin,
      actorId: second.id,
      accounts: [admin, second],
    });
    expect(r.ok).toBe(true);
  });

  it('the last active Admin cannot be demoted or deactivated by anyone', () => {
    const inactiveAdmin = record(3, { role: 'admin', active: false, email: 'old@techstalwarts.com' });
    const accounts = [admin, inactiveAdmin];
    expect(check(draft({ ...admin, role: 'ta' }), { current: admin, actorId: 99, accounts }).ok).toBe(false);
    expect(check(draft({ ...admin, active: false }), { current: admin, actorId: 99, accounts }).ok).toBe(false);
  });
});

describe('what an edit changes', () => {
  const before = record(2);

  it('role, head flag, interviewer duty, email and active each need a new session (R16)', () => {
    expect(needsNewSession(before, { ...before, role: 'sales' })).toBe(true);
    expect(needsNewSession(before, { ...before, isTeamLead: true })).toBe(true);
    expect(needsNewSession(before, { ...before, interviewerDuty: true })).toBe(true);
    expect(needsNewSession(before, { ...before, email: 'new@techstalwarts.com' })).toBe(true);
    expect(needsNewSession(before, { ...before, active: false })).toBe(true);
  });

  it('a name or access-until change does not (the account check reads access-until live)', () => {
    expect(needsNewSession(before, { ...before, name: 'Renamed' })).toBe(false);
    expect(needsNewSession(before, { ...before, accessUntil: '2026-12-31' })).toBe(false);
  });

  it('the log records before and after for each changed field only (R19)', () => {
    expect(changedFields(before, { ...before, role: 'sales', accessUntil: '2026-12-31' })).toEqual({
      role: { before: 'ta', after: 'sales' },
      accessUntil: { before: null, after: '2026-12-31' },
    });
  });
});
