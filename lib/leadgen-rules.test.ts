import { describe, expect, it } from 'vitest';
import {
  bantScore,
  campaignAccess,
  campaignResults,
  canRaiseRequirement,
  conversionError,
  dueFollowUps,
  findDuplicates,
  leadAccess,
  leadMoveError,
  normaliseCompanyName,
  prospectAccess,
  stageAfterMeeting,
  stageChangeError,
  type LeadRow,
} from './leadgen-rules';

describe('company name normalisation (Q6)', () => {
  it('ignores case, punctuation and legal suffixes', () => {
    expect(normaliseCompanyName('Nimbus FinTech Pvt. Ltd.')).toBe('nimbus fintech');
    expect(normaliseCompanyName('Nimbus Fintech Private Limited')).toBe('nimbus fintech');
    expect(normaliseCompanyName('NIMBUS-FINTECH LLP')).toBe('nimbus fintech');
    expect(normaliseCompanyName('Acme Inc')).toBe('acme');
    expect(normaliseCompanyName('Acme, LLC')).toBe('acme');
    expect(normaliseCompanyName('Acme Pvt Ltd LLC')).toBe('acme');
  });

  it('keeps suffix words that are not at the end', () => {
    expect(normaliseCompanyName('Limited Brands')).toBe('limited brands');
    expect(normaliseCompanyName('Private Equity Partners')).toBe('private equity partners');
  });

  it('treats & and "and" alike', () => {
    expect(normaliseCompanyName('Smith & Sons')).toBe(normaliseCompanyName('Smith and Sons'));
  });

  it('a name that is only a suffix normalises to itself, not empty', () => {
    expect(normaliseCompanyName('Ltd')).toBe('ltd');
  });
});

describe('findDuplicates (AE1)', () => {
  const records = [
    { kind: 'client' as const, id: 1, name: 'Nimbus Fintech Private Limited' },
    { kind: 'prospect' as const, id: 7, name: 'Nimbus FinTech' },
    { kind: 'prospect' as const, id: 8, name: 'Nimbus Health' },
  ];

  it('matches a client and a prospect under different spellings', () => {
    const hits = findDuplicates('Nimbus FinTech Pvt Ltd', records);
    expect(hits.map((h) => `${h.kind}${h.id}`)).toEqual(['client1', 'prospect7']);
  });

  it('excludes the record being edited', () => {
    const hits = findDuplicates('Nimbus FinTech', records, { kind: 'prospect', id: 7 });
    expect(hits.map((h) => h.id)).toEqual([1]);
  });

  it('a blank name matches nothing', () => {
    expect(findDuplicates('  ', records)).toEqual([]);
    expect(findDuplicates('.,', records)).toEqual([]);
  });
});

describe('prospect stage (AE2, AE3)', () => {
  it('any open stage may move to any other except converted', () => {
    expect(stageChangeError('new', 'qualified')).toBeNull();
    expect(stageChangeError('qualified', 'contacted')).toBeNull();
    expect(stageChangeError('contacted', 'converted')).toMatch(/Convert/);
  });

  it('dead needs a reason', () => {
    expect(stageChangeError('new', 'dead')).toMatch(/reason/);
    expect(stageChangeError('new', 'dead', '  ')).toMatch(/reason/);
    expect(stageChangeError('new', 'dead', 'Went with a competitor')).toBeNull();
  });

  it('a converted prospect is fixed', () => {
    expect(stageChangeError('converted', 'qualified')).toMatch(/fixed/);
    expect(stageChangeError('converted', 'converted')).toBeNull();
  });

  it('converts only from qualified, and only once (Q3)', () => {
    expect(conversionError('qualified')).toBeNull();
    expect(conversionError('contacted')).toMatch(/qualified/);
    expect(conversionError('converted')).toMatch(/already/);
    expect(conversionError('dead')).toMatch(/qualified/);
  });

  it('a meeting suggests meeting_set only before it (R4)', () => {
    expect(stageAfterMeeting('new')).toBe('meeting_set');
    expect(stageAfterMeeting('contacted')).toBe('meeting_set');
    expect(stageAfterMeeting('meeting_set')).toBeNull();
    expect(stageAfterMeeting('qualified')).toBeNull();
  });
});

describe('lead status', () => {
  it('handoff and closure from open; requirement_raised is never chosen by hand', () => {
    expect(leadMoveError('open', 'handed_off')).toBeNull();
    expect(leadMoveError('open', 'requirement_raised')).toMatch(/cannot/);
    expect(leadMoveError('handed_off', 'requirement_raised')).toMatch(/cannot/);
  });

  it('closing needs a reason; a lost lead can be reopened', () => {
    expect(leadMoveError('handed_off', 'closed_lost')).toMatch(/reason/);
    expect(leadMoveError('handed_off', 'closed_lost', 'Budget frozen')).toBeNull();
    expect(leadMoveError('closed_lost', 'open')).toBeNull();
  });

  it('requirements are raised only from a lead Sales holds', () => {
    expect(canRaiseRequirement('open')).toBe(false);
    expect(canRaiseRequirement('handed_off')).toBe(true);
    expect(canRaiseRequirement('requirement_raised')).toBe(true);
    expect(canRaiseRequirement('closed_lost')).toBe(false);
  });

  it('counts BANT ticks', () => {
    expect(bantScore({ budget: true, authority: false, need: true, timeline: null })).toBe(2);
    expect(bantScore({})).toBe(0);
  });
});

describe('campaign results (AE5)', () => {
  it('10 prospects, 6 reached, 3 responded, 2 meetings, 1 lead', () => {
    const prospects = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const activities = [
      { prospectId: 1, type: 'call', outcome: 'interested' },
      { prospectId: 1, type: 'meeting', outcome: null },
      { prospectId: 2, type: 'email', outcome: 'interested' },
      { prospectId: 2, type: 'meeting', outcome: 'follow_up' },
      { prospectId: 3, type: 'call', outcome: 'interested' },
      { prospectId: 4, type: 'call', outcome: 'no_answer' },
      { prospectId: 5, type: 'call', outcome: 'not_interested' },
      { prospectId: 6, type: 'linkedin', outcome: null },
      // Another campaign's prospect — must not count.
      { prospectId: 99, type: 'meeting', outcome: 'interested' },
    ];
    expect(campaignResults(prospects, activities, [1, 99, null])).toEqual({
      prospects: 10,
      reached: 6,
      responded: 3,
      meetings: 2,
      leads: 1,
      conversionPct: 16.7,
    });
  });

  it('nobody reached gives a null conversion, not 0', () => {
    expect(campaignResults([1, 2], [], []).conversionPct).toBeNull();
  });
});

describe('due follow-ups (R2)', () => {
  const a = (id: number, prospectId: number | null, activityDate: string, nextFollowUp: string | null) => ({
    id,
    prospectId,
    leadId: prospectId === null ? 50 : null,
    activityDate,
    nextFollowUp,
  });

  it('only the latest activity per prospect counts, due on or before today', () => {
    const due = dueFollowUps(
      [
        a(1, 1, '2026-10-01', '2026-10-05'), // superseded by id 2
        a(2, 1, '2026-10-06', null),
        a(3, 2, '2026-10-10', '2026-10-22'),
        a(4, 3, '2026-10-10', '2026-10-23'), // not yet
        a(5, null, '2026-10-01', '2026-10-15'), // a lead's
      ],
      '2026-10-22',
    );
    expect(due.map((d) => d.id)).toEqual([5, 3]);
  });

  it('a tie on date goes to the later row', () => {
    const due = dueFollowUps([a(1, 1, '2026-10-01', '2026-10-02'), a(2, 1, '2026-10-01', null)], '2026-10-22');
    expect(due).toEqual([]);
  });
});

describe('row-level access (Q4, AE6)', () => {
  const member = { role: 'leadgen', uid: 10, isTeamLead: false };
  const head = { role: 'leadgen', uid: 11, isTeamLead: true };
  const leadgenTeam = [10, 11, 12];

  it('a Leadgen member sees and edits only their own prospects', () => {
    expect(prospectAccess(member, 10, leadgenTeam)).toEqual({ read: true, edit: true });
    expect(prospectAccess(member, 12, leadgenTeam)).toEqual({ read: false, edit: false });
    expect(prospectAccess(member, null, leadgenTeam)).toEqual({ read: false, edit: false });
  });

  it("a Leadgen head sees the team's and unowned, not an outsider's", () => {
    expect(prospectAccess(head, 12, leadgenTeam).edit).toBe(true);
    expect(prospectAccess(head, null, leadgenTeam).edit).toBe(true);
    expect(prospectAccess(head, 99, leadgenTeam).read).toBe(false);
  });

  it('Sales and Management read every prospect and edit none; TA gets nothing', () => {
    for (const role of ['sales', 'management']) {
      expect(prospectAccess({ role, uid: 1, isTeamLead: true }, 10, leadgenTeam)).toEqual({ read: true, edit: false });
    }
    expect(prospectAccess({ role: 'ta', uid: 1, isTeamLead: false }, 10, leadgenTeam).read).toBe(false);
    expect(prospectAccess({ role: 'admin', uid: 1, isTeamLead: false }, 10, leadgenTeam).edit).toBe(true);
  });

  it('every Leadgen member reads campaigns; only owner, head or Admin edits', () => {
    expect(campaignAccess(member, 12, leadgenTeam)).toEqual({ read: true, edit: false });
    expect(campaignAccess(member, 10, leadgenTeam).edit).toBe(true);
    expect(campaignAccess(head, 12, leadgenTeam).edit).toBe(true);
    expect(campaignAccess({ role: 'sales', uid: 1, isTeamLead: true }, 1, leadgenTeam).edit).toBe(false);
  });

  describe('leads', () => {
    const teams = { leadgen: leadgenTeam, sales: [20, 21, 22] };
    const salesMember = { role: 'sales', uid: 20, isTeamLead: false };
    const salesHead = { role: 'sales', uid: 21, isTeamLead: true };
    const open: LeadRow = { status: 'open', leadOwnerUserId: 10, salesOwnerUserId: null, handedOffAt: null };
    const queued: LeadRow = { ...open, status: 'handed_off', handedOffAt: '2026-10-20' };
    const assigned: LeadRow = { ...queued, salesOwnerUserId: 22 };

    it('Leadgen edits until handoff, then can still log activity', () => {
      expect(leadAccess(member, open, teams)).toEqual({ read: true, edit: true, log: true });
      expect(leadAccess(member, queued, teams)).toEqual({ read: true, edit: false, log: true });
      expect(leadAccess({ ...member, uid: 12 }, open, teams).read).toBe(false);
    });

    it('Sales never sees a lead Leadgen still holds', () => {
      expect(leadAccess(salesHead, open, teams).read).toBe(false);
      expect(leadAccess(salesMember, open, teams).read).toBe(false);
    });

    it('a Sales member reads the queue and their own, edits only their own', () => {
      expect(leadAccess(salesMember, queued, teams)).toEqual({ read: true, edit: false, log: false });
      expect(leadAccess(salesMember, assigned, teams).read).toBe(false);
      expect(leadAccess(salesMember, { ...assigned, salesOwnerUserId: 20 }, teams).edit).toBe(true);
    });

    it("a Sales head edits the queue and the team's (AE4)", () => {
      expect(leadAccess(salesHead, queued, teams).edit).toBe(true);
      expect(leadAccess(salesHead, assigned, teams).edit).toBe(true);
      expect(leadAccess(salesHead, { ...assigned, salesOwnerUserId: 99 }, teams).read).toBe(false);
    });

    it('Management reads, Admin does everything, TA nothing', () => {
      expect(leadAccess({ role: 'management', uid: 1, isTeamLead: false }, open, teams)).toEqual({
        read: true,
        edit: false,
        log: false,
      });
      expect(leadAccess({ role: 'admin', uid: 1, isTeamLead: false }, assigned, teams).edit).toBe(true);
      expect(leadAccess({ role: 'ta', uid: 1, isTeamLead: false }, assigned, teams).read).toBe(false);
    });
  });
});
