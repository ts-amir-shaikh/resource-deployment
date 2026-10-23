import 'server-only';
import { and, asc, desc, eq, inArray, like, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { db, type Executor } from './db';
import { activities, campaigns, clients, leads, opportunities, prospectContacts, prospects, users } from './schema';
import { canSetOwner } from './ownership';
import {
  campaignAccessFor,
  leadAccessFor,
  leadScope,
  prospectAccessFor,
  prospectScope,
} from './leadgen-ownership';
import {
  campaignResults,
  canRaiseRequirement,
  conversionError,
  dueFollowUps,
  findDuplicates,
  leadMoveError,
  stageAfterMeeting,
  stageChangeError,
  type CampaignResults,
  type CompanyRecord,
  type LeadStatus,
  type ProspectStage,
} from './leadgen-rules';
import type {
  activitySchema,
  campaignSchema,
  leadAssignSchema,
  leadConvertSchema,
  leadCreateSchema,
  leadHandoffSchema,
  leadUpdateSchema,
  prospectContactSchema,
  prospectSchema,
} from './validations';
import type { Role } from './auth';
import type { Viewer } from './session';
import { today } from './utils';

/**
 * Server-side reads and writes for M66. The rules are in
 * lib/leadgen-rules.ts and the per-row access in lib/leadgen-ownership.ts;
 * every function here checks access before it reads or writes a row, so the
 * routes and the pages share one gate.
 *
 * A row the viewer may not read is reported as "not found" (404), never
 * "forbidden": a Leadgen member should not learn that a colleague's prospect
 * exists by probing ids (AE6).
 */

export class LeadgenError extends Error {
  constructor(
    message: string,
    readonly status: number = 422,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const notFound = (what: string) => new LeadgenError(`${what} not found`, 404);
const forbidden = (message: string) => new LeadgenError(message, 403);

const now = () => new Date().toISOString();

type ProspectInput = z.output<typeof prospectSchema>;
type ContactInput = z.output<typeof prospectContactSchema>;
type CampaignInput = z.output<typeof campaignSchema>;
type ActivityInput = z.output<typeof activitySchema>;
type LeadConvertInput = z.output<typeof leadConvertSchema>;
type LeadCreateInput = z.output<typeof leadCreateSchema>;
type LeadUpdateInput = z.output<typeof leadUpdateSchema>;

const owner = alias(users, 'owner_user');
const salesOwner = alias(users, 'sales_owner_user');
const suggested = alias(users, 'suggested_user');

/** An active account with this role, or an error naming what was wrong. */
async function requireMember(tx: Executor, userId: number, role: Role, label: string) {
  const u = await tx.select({ role: users.role, active: users.active }).from(users).where(eq(users.id, userId)).get();
  if (!u || !u.active || u.role !== role) throw new LeadgenError(`${label} must be an active ${role} account`);
}

async function requireCampaign(tx: Executor, campaignId: number | null) {
  if (campaignId === null) return;
  const c = await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!c) throw new LeadgenError('Selected campaign no longer exists');
}

/**
 * The owner a new prospect, campaign or lead gets. A Leadgen member always
 * owns what they create; a head or Admin may name someone in their reach;
 * nobody else owns by default.
 */
async function ownerOnCreate(v: Viewer, requested: number | null | undefined): Promise<number | null> {
  if (v.role === 'leadgen' && !v.isTeamLead) return v.uid || null;
  if (requested !== null && requested !== undefined) {
    if (!(await canSetOwner(v, 'lead', requested))) throw forbidden('You cannot assign this owner');
    await requireMember(db, requested, 'leadgen', 'The owner');
    return requested;
  }
  return v.role === 'leadgen' ? v.uid || null : null;
}

/** A changed owner on edit: only a head (within the team) or Admin (Q4). */
async function ownerOnEdit(v: Viewer, current: number | null, requested: number | null | undefined): Promise<number | null> {
  if (requested === undefined || requested === current) return current;
  if (!(await canSetOwner(v, 'lead', requested))) throw forbidden('Only a Leadgen head or Admin can change the owner');
  if (requested !== null) await requireMember(db, requested, 'leadgen', 'The owner');
  return requested;
}

/* ── Duplicate check (Q6) ──────────────────────────────────── */

export type DuplicateHit = CompanyRecord & { ownerName: string | null };

export async function companyDuplicates(
  name: string,
  exclude?: { kind: 'prospect' | 'client'; id: number },
): Promise<DuplicateHit[]> {
  const [ps, cs] = await Promise.all([
    db
      .select({ id: prospects.id, name: prospects.companyName, ownerName: owner.name })
      .from(prospects)
      .leftJoin(owner, eq(prospects.ownerUserId, owner.id))
      .all(),
    db.select({ id: clients.id, name: clients.companyName }).from(clients).all(),
  ]);
  const records: CompanyRecord[] = [
    ...cs.map((c) => ({ kind: 'client' as const, id: c.id, name: c.name })),
    ...ps.map((p) => ({ kind: 'prospect' as const, id: p.id, name: p.name })),
  ];
  const owners = new Map(ps.map((p) => [p.id, p.ownerName]));
  return findDuplicates(name, records, exclude).map((r) => ({
    ...r,
    ownerName: r.kind === 'prospect' ? (owners.get(r.id) ?? null) : null,
  }));
}

/** Refuses with the matches unless the user has already seen them and chose to go ahead. */
async function guardDuplicates(name: string, confirmed: boolean, exclude?: { kind: 'prospect' | 'client'; id: number }) {
  if (confirmed) return;
  const hits = await companyDuplicates(name, exclude);
  if (hits.length) {
    throw new LeadgenError('A company with a similar name already exists', 409, { duplicates: hits });
  }
}

/** For the client form and the older POST /api/prospects — the same warning everywhere a company is created (R6). */
export const guardCompanyDuplicates = (name: string, confirmed: boolean) => guardDuplicates(name, confirmed);

/* ── Prospects ─────────────────────────────────────────────── */

export type ProspectFilters = {
  q?: string;
  stage?: string;
  temperature?: string;
  ownerUserId?: number;
  campaignId?: number;
};

export async function listProspects(v: Viewer, f: ProspectFilters = {}) {
  const where: (SQL | undefined)[] = [await prospectScope(v)];
  if (f.q) where.push(like(prospects.companyName, `%${f.q}%`));
  if (f.stage) where.push(eq(prospects.stage, f.stage as ProspectStage));
  if (f.temperature) where.push(eq(prospects.temperature, f.temperature as 'cold'));
  if (f.ownerUserId) where.push(eq(prospects.ownerUserId, f.ownerUserId));
  if (f.campaignId) where.push(eq(prospects.campaignId, f.campaignId));

  return db
    .select({
      id: prospects.id,
      companyName: prospects.companyName,
      stage: prospects.stage,
      temperature: prospects.temperature,
      ownerUserId: prospects.ownerUserId,
      ownerName: owner.name,
      source: prospects.source,
      campaignId: prospects.campaignId,
      campaignName: campaigns.name,
      industry: prospects.industry,
      location: prospects.location,
      convertedClientId: prospects.convertedClientId,
      primaryContact: sql<string | null>`(select c.name from prospect_contacts c where c.prospect_id = ${prospects.id} order by c.is_primary desc, c.id limit 1)`,
      lastActivity: sql<string | null>`(select max(a.activity_date) from activities a where a.prospect_id = ${prospects.id})`,
      nextFollowUp: sql<string | null>`(select a.next_follow_up from activities a where a.prospect_id = ${prospects.id} order by a.activity_date desc, a.id desc limit 1)`,
      createdAt: prospects.createdAt,
    })
    .from(prospects)
    .leftJoin(owner, eq(prospects.ownerUserId, owner.id))
    .leftJoin(campaigns, eq(prospects.campaignId, campaigns.id))
    .where(and(...where))
    .orderBy(desc(prospects.id))
    .all();
}

export type ProspectListRow = Awaited<ReturnType<typeof listProspects>>[number];

async function loadProspect(tx: Executor, id: number) {
  return tx.select().from(prospects).where(eq(prospects.id, id)).get();
}

async function activityRows(where: SQL) {
  const by = alias(users, 'by_user');
  return db
    .select({
      id: activities.id,
      prospectId: activities.prospectId,
      leadId: activities.leadId,
      campaignId: activities.campaignId,
      campaignName: campaigns.name,
      contactId: activities.contactId,
      contactName: prospectContacts.name,
      type: activities.type,
      activityDate: activities.activityDate,
      outcome: activities.outcome,
      notes: activities.notes,
      nextFollowUp: activities.nextFollowUp,
      attendees: activities.attendees,
      nextStep: activities.nextStep,
      byName: by.name,
      createdAt: activities.createdAt,
    })
    .from(activities)
    .leftJoin(prospectContacts, eq(activities.contactId, prospectContacts.id))
    .leftJoin(campaigns, eq(activities.campaignId, campaigns.id))
    .leftJoin(by, eq(activities.byUserId, by.id))
    .where(where)
    .orderBy(desc(activities.activityDate), desc(activities.id))
    .all();
}

export type ActivityRow = Awaited<ReturnType<typeof activityRows>>[number];

/** The prospect page: the record, its contacts, its timeline, its lead. Null when out of reach. */
export async function getProspectDetail(v: Viewer, id: number) {
  const p = await loadProspect(db, id);
  if (!p) return null;
  const access = await prospectAccessFor(v, p.ownerUserId);
  if (!access.read) return null;

  const [ownerRow, campaign, client, contacts, timeline, lead] = await Promise.all([
    p.ownerUserId ? db.select({ name: users.name }).from(users).where(eq(users.id, p.ownerUserId)).get() : undefined,
    p.campaignId ? db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.id, p.campaignId)).get() : undefined,
    p.convertedClientId
      ? db.select({ id: clients.id, name: clients.companyName }).from(clients).where(eq(clients.id, p.convertedClientId)).get()
      : undefined,
    db.select().from(prospectContacts).where(eq(prospectContacts.prospectId, id)).orderBy(desc(prospectContacts.isPrimary), asc(prospectContacts.id)).all(),
    activityRows(eq(activities.prospectId, id)),
    db.select({ id: leads.id, title: leads.title, status: leads.status }).from(leads).where(eq(leads.prospectId, id)).get(),
  ]);

  return {
    prospect: { ...p, ownerName: ownerRow?.name ?? null },
    campaign: campaign ?? null,
    client: client ?? null,
    contacts,
    activities: timeline,
    lead: lead ?? null,
    access,
  };
}

export async function createProspect(v: Viewer, data: ProspectInput) {
  await guardDuplicates(data.companyName, data.confirmDuplicate);
  const stageError = stageChangeError('new', data.stage, data.deadReason);
  if (stageError) throw new LeadgenError(stageError);
  const ownerUserId = await ownerOnCreate(v, data.ownerUserId);
  await requireCampaign(db, data.campaignId);

  return db.transaction(async (tx) => {
    const row = await tx
      .insert(prospects)
      .values({
        companyName: data.companyName,
        stage: data.stage,
        temperature: data.temperature,
        ownerUserId,
        source: data.source,
        campaignId: data.campaignId,
        website: data.website,
        industry: data.industry,
        location: data.location,
        notes: data.notes,
        deadReason: data.stage === 'dead' ? data.deadReason : null,
        createdByUserId: v.uid || null,
        updatedAt: now(),
      })
      .returning()
      .get();
    const anyPrimary = data.contacts.some((c) => c.isPrimary);
    for (const [i, c] of data.contacts.entries()) {
      await tx
        .insert(prospectContacts)
        .values({ ...c, prospectId: row.id, isPrimary: anyPrimary ? c.isPrimary : i === 0 })
        .run();
    }
    return row;
  });
}

export async function updateProspect(v: Viewer, id: number, data: ProspectInput) {
  const p = await loadProspect(db, id);
  if (!p) throw notFound('Prospect');
  const access = await prospectAccessFor(v, p.ownerUserId);
  if (!access.read) throw notFound('Prospect');
  if (!access.edit) throw forbidden('You cannot edit this prospect');

  // A converted prospect keeps its stage whatever the form sends; the lead
  // carries the story on from there.
  const stage: ProspectStage = p.stage === 'converted' ? 'converted' : data.stage;
  const stageError = stageChangeError(p.stage, stage, data.deadReason);
  if (stageError) throw new LeadgenError(stageError);
  if (data.companyName !== p.companyName) {
    await guardDuplicates(data.companyName, data.confirmDuplicate, { kind: 'prospect', id });
  }
  const ownerUserId = await ownerOnEdit(v, p.ownerUserId, data.ownerUserId);
  await requireCampaign(db, data.campaignId);

  return db.transaction(async (tx) => {
    const row = await tx
      .update(prospects)
      .set({
        companyName: data.companyName,
        stage,
        temperature: data.temperature,
        ownerUserId,
        source: data.source,
        campaignId: data.campaignId,
        website: data.website ?? null,
        industry: data.industry ?? null,
        location: data.location ?? null,
        notes: data.notes ?? null,
        deadReason: stage === 'dead' ? data.deadReason : null,
        updatedAt: now(),
      })
      .where(eq(prospects.id, id))
      .returning()
      .get();
    // The name on requirements and leads is a label copied from the record;
    // keep it in step so a rename does not leave two spellings about. Rows
    // that have become a client's are the client's name now and are left.
    if (data.companyName !== p.companyName && !p.convertedClientId) {
      await tx
        .update(opportunities)
        .set({ companyName: data.companyName })
        .where(and(eq(opportunities.prospectId, id), sql`${opportunities.clientId} is null`))
        .run();
      await tx
        .update(leads)
        .set({ companyName: data.companyName })
        .where(and(eq(leads.prospectId, id), sql`${leads.clientId} is null`))
        .run();
    }
    return row;
  });
}

async function editableProspect(v: Viewer, id: number) {
  const p = await loadProspect(db, id);
  if (!p) throw notFound('Prospect');
  const access = await prospectAccessFor(v, p.ownerUserId);
  if (!access.read) throw notFound('Prospect');
  if (!access.edit) throw forbidden('You cannot edit this prospect');
  return p;
}

/** One primary contact per prospect: setting one clears the rest. */
async function writeContact(tx: Executor, prospectId: number, data: ContactInput, contactId?: number) {
  if (data.isPrimary) {
    await tx.update(prospectContacts).set({ isPrimary: false }).where(eq(prospectContacts.prospectId, prospectId)).run();
  }
  const values = {
    name: data.name,
    designation: data.designation ?? null,
    email: data.email ?? null,
    mobile: data.mobile ?? null,
    linkedin: data.linkedin ?? null,
    isPrimary: data.isPrimary,
  };
  const row = contactId
    ? await tx
        .update(prospectContacts)
        .set(values)
        .where(and(eq(prospectContacts.id, contactId), eq(prospectContacts.prospectId, prospectId)))
        .returning()
        .get()
    : await tx.insert(prospectContacts).values({ ...values, prospectId }).returning().get();
  if (!row) throw notFound('Contact');
  // Stamped so the migration's one-time contact copy never revives a contact
  // deleted here (scripts/migrate.ts, KTD1).
  await tx.update(prospects).set({ updatedAt: now() }).where(eq(prospects.id, prospectId)).run();
  return row;
}

export async function addContact(v: Viewer, prospectId: number, data: ContactInput) {
  await editableProspect(v, prospectId);
  return db.transaction((tx) => writeContact(tx, prospectId, data));
}

export async function updateContact(v: Viewer, prospectId: number, contactId: number, data: ContactInput) {
  await editableProspect(v, prospectId);
  return db.transaction((tx) => writeContact(tx, prospectId, data, contactId));
}

export async function deleteContact(v: Viewer, prospectId: number, contactId: number) {
  await editableProspect(v, prospectId);
  await db.transaction(async (tx) => {
    const gone = await tx
      .delete(prospectContacts)
      .where(and(eq(prospectContacts.id, contactId), eq(prospectContacts.prospectId, prospectId)))
      .returning({ id: prospectContacts.id })
      .get();
    if (!gone) throw notFound('Contact');
    await tx.update(prospects).set({ updatedAt: now() }).where(eq(prospects.id, prospectId)).run();
  });
}

/**
 * D4 / Q3. Creates the lead and moves the prospect to `converted` in one
 * transaction. The stage is re-checked in the UPDATE itself, so two people
 * converting at once produce one lead, not two.
 */
export async function convertProspect(v: Viewer, id: number, data: LeadConvertInput) {
  const p = await editableProspect(v, id);
  const error = conversionError(p.stage);
  if (error) throw new LeadgenError(error, 409);

  return db.transaction(async (tx) => {
    const moved = await tx
      .update(prospects)
      .set({ stage: 'converted', updatedAt: now() })
      .where(and(eq(prospects.id, id), eq(prospects.stage, 'qualified')))
      .returning({ id: prospects.id })
      .get();
    if (!moved) throw new LeadgenError('This prospect has already been converted to a lead', 409);
    return tx
      .insert(leads)
      .values({
        ...data,
        prospectId: id,
        clientId: p.convertedClientId,
        companyName: p.companyName,
        status: 'open',
        leadOwnerUserId: p.ownerUserId ?? (v.role === 'leadgen' ? v.uid || null : null),
        createdByUserId: v.uid || null,
        updatedAt: now(),
      })
      .returning()
      .get();
  });
}

/* ── Campaigns ─────────────────────────────────────────────── */

/** R7 for every campaign at once — three queries, whatever the number of campaigns. */
async function resultsByCampaign(campaignIds: number[]): Promise<Map<number, CampaignResults>> {
  const out = new Map<number, CampaignResults>();
  if (!campaignIds.length) return out;
  const ps = await db
    .select({ id: prospects.id, campaignId: prospects.campaignId })
    .from(prospects)
    .where(inArray(prospects.campaignId, campaignIds))
    .all();
  const ids = ps.map((p) => p.id);
  const [acts, leadRows] = ids.length
    ? await Promise.all([
        db
          .select({ prospectId: activities.prospectId, type: activities.type, outcome: activities.outcome })
          .from(activities)
          .where(inArray(activities.prospectId, ids))
          .all(),
        db.select({ prospectId: leads.prospectId }).from(leads).where(inArray(leads.prospectId, ids)).all(),
      ])
    : [[], []];
  for (const cid of campaignIds) {
    const mine = ps.filter((p) => p.campaignId === cid).map((p) => p.id);
    out.set(cid, campaignResults(mine, acts, leadRows.map((l) => l.prospectId)));
  }
  return out;
}

export async function listCampaigns() {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      segment: campaigns.segment,
      channel: campaigns.channel,
      startDate: campaigns.startDate,
      endDate: campaigns.endDate,
      status: campaigns.status,
      ownerUserId: campaigns.ownerUserId,
      ownerName: owner.name,
    })
    .from(campaigns)
    .leftJoin(owner, eq(campaigns.ownerUserId, owner.id))
    .orderBy(desc(campaigns.id))
    .all();
  const results = await resultsByCampaign(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, results: results.get(r.id)! }));
}

export type CampaignListRow = Awaited<ReturnType<typeof listCampaigns>>[number];

/** Campaign names for pickers. */
export async function campaignOptions() {
  return db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status }).from(campaigns).orderBy(desc(campaigns.id)).all();
}

export async function getCampaignDetail(v: Viewer, id: number) {
  const c = await db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!c) return null;
  const access = await campaignAccessFor(v, c.ownerUserId);
  if (!access.read) return null;
  const [ownerRow, results, members] = await Promise.all([
    c.ownerUserId ? db.select({ name: users.name }).from(users).where(eq(users.id, c.ownerUserId)).get() : undefined,
    resultsByCampaign([id]),
    // The figures cover the whole campaign; the list only the prospects this
    // viewer may open.
    listProspects(v, { campaignId: id }),
  ]);
  return { campaign: { ...c, ownerName: ownerRow?.name ?? null }, results: results.get(id)!, prospects: members, access };
}

export async function createCampaign(v: Viewer, data: CampaignInput) {
  const ownerUserId = await ownerOnCreate(v, data.ownerUserId);
  return db
    .insert(campaigns)
    .values({ ...data, ownerUserId, createdByUserId: v.uid || null })
    .returning()
    .get();
}

export async function updateCampaign(v: Viewer, id: number, data: CampaignInput) {
  const c = await db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!c) throw notFound('Campaign');
  const access = await campaignAccessFor(v, c.ownerUserId);
  if (!access.edit) throw forbidden('You cannot edit this campaign');
  const ownerUserId = await ownerOnEdit(v, c.ownerUserId, data.ownerUserId);
  return db
    .update(campaigns)
    .set({
      name: data.name,
      segment: data.segment ?? null,
      channel: data.channel,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      status: data.status,
      ownerUserId,
      notes: data.notes ?? null,
    })
    .where(eq(campaigns.id, id))
    .returning()
    .get();
}

/* ── Activities ────────────────────────────────────────────── */

/**
 * R2/R4. On a lead, the viewer needs the lead's `log` right and the activity
 * is filed against its prospect too, so the prospect's timeline stays whole.
 * On a prospect alone, the viewer needs to be able to edit the prospect.
 */
export async function logActivity(v: Viewer, data: ActivityInput) {
  let prospectId = data.prospectId;
  if (data.leadId !== null) {
    const lead = await loadLead(data.leadId);
    if (!lead) throw notFound('Lead');
    const access = await leadAccessFor(v, lead);
    if (!access.read) throw notFound('Lead');
    if (!access.log) throw forbidden('You cannot log activity on this lead');
    prospectId = lead.prospectId;
  } else {
    await editableProspect(v, prospectId!);
  }
  if (data.contactId !== null) {
    const c = await db
      .select({ prospectId: prospectContacts.prospectId })
      .from(prospectContacts)
      .where(eq(prospectContacts.id, data.contactId))
      .get();
    if (!c || c.prospectId !== prospectId) throw new LeadgenError('That contact is not on this prospect');
  }
  await requireCampaign(db, data.campaignId);

  return db.transaction(async (tx) => {
    const row = await tx
      .insert(activities)
      .values({
        prospectId,
        leadId: data.leadId,
        campaignId: data.campaignId,
        contactId: data.contactId,
        type: data.type,
        activityDate: data.activityDate,
        outcome: data.outcome,
        notes: data.notes,
        nextFollowUp: data.nextFollowUp,
        attendees: data.type === 'meeting' ? data.attendees : null,
        nextStep: data.nextStep,
        byUserId: v.uid || null,
      })
      .returning()
      .get();
    if (prospectId !== null) {
      const p = await loadProspect(tx, prospectId);
      const next = p && data.type === 'meeting' && data.advanceStage ? stageAfterMeeting(p.stage) : null;
      await tx
        .update(prospects)
        .set(next ? { stage: next, updatedAt: now() } : { updatedAt: now() })
        .where(eq(prospects.id, prospectId))
        .run();
    }
    return row;
  });
}

/**
 * Follow-ups due today or earlier on what this viewer can see: open
 * prospects (not converted, not dead) and leads still in play.
 */
export async function followUpsDue(v: Viewer) {
  const [ps, ls] = await Promise.all([
    db
      .select({ id: prospects.id, name: prospects.companyName })
      .from(prospects)
      .where(and(await prospectScope(v), notInArray(prospects.stage, ['converted', 'dead'])))
      .all(),
    db
      .select({ id: leads.id, name: leads.companyName, title: leads.title })
      .from(leads)
      .where(and(await leadScope(v), inArray(leads.status, ['open', 'handed_off', 'requirement_raised'])))
      .all(),
  ]);
  const pIds = ps.map((p) => p.id);
  const lIds = ls.map((l) => l.id);
  if (!pIds.length && !lIds.length) return [];
  const conds: SQL[] = [];
  // A prospect's own activities count until it has a lead; after that the
  // lead's activities do.
  if (pIds.length) conds.push(and(inArray(activities.prospectId, pIds), sql`${activities.leadId} is null`)!);
  if (lIds.length) conds.push(inArray(activities.leadId, lIds));
  const rows = await db
    .select({
      id: activities.id,
      prospectId: activities.prospectId,
      leadId: activities.leadId,
      type: activities.type,
      activityDate: activities.activityDate,
      nextFollowUp: activities.nextFollowUp,
      nextStep: activities.nextStep,
    })
    .from(activities)
    .where(or(...conds))
    .all();
  const pName = new Map(ps.map((p) => [p.id, p.name]));
  const lName = new Map(ls.map((l) => [l.id, `${l.name} — ${l.title}`]));
  return dueFollowUps(rows, today()).map((a) => ({
    ...a,
    label: a.leadId !== null ? (lName.get(a.leadId) ?? '') : (pName.get(a.prospectId!) ?? ''),
    href: a.leadId !== null ? `/lead-records/${a.leadId}` : `/prospects/${a.prospectId}`,
  }));
}

export type FollowUpRow = Awaited<ReturnType<typeof followUpsDue>>[number];

/* ── Leads ─────────────────────────────────────────────────── */

async function loadLead(id: number, tx: Executor = db) {
  return tx.select().from(leads).where(eq(leads.id, id)).get();
}

export async function listLeads(v: Viewer, f: { status?: string; q?: string; salesOwnerUserId?: number } = {}) {
  const where: (SQL | undefined)[] = [await leadScope(v)];
  if (f.status) where.push(eq(leads.status, f.status as LeadStatus));
  if (f.q) where.push(or(like(leads.companyName, `%${f.q}%`), like(leads.title, `%${f.q}%`)));
  if (f.salesOwnerUserId) where.push(eq(leads.salesOwnerUserId, f.salesOwnerUserId));
  return db
    .select({
      id: leads.id,
      prospectId: leads.prospectId,
      clientId: leads.clientId,
      companyName: leads.companyName,
      title: leads.title,
      temperature: leads.temperature,
      status: leads.status,
      bantBudget: leads.bantBudget,
      bantAuthority: leads.bantAuthority,
      bantNeed: leads.bantNeed,
      bantTimeline: leads.bantTimeline,
      leadOwnerUserId: leads.leadOwnerUserId,
      leadOwnerName: owner.name,
      salesOwnerUserId: leads.salesOwnerUserId,
      salesOwnerName: salesOwner.name,
      suggestedSalesName: suggested.name,
      handedOffAt: leads.handedOffAt,
      requirementCount: sql<number>`(select count(*) from opportunities o where o.lead_id = ${leads.id})`,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(owner, eq(leads.leadOwnerUserId, owner.id))
    .leftJoin(salesOwner, eq(leads.salesOwnerUserId, salesOwner.id))
    .leftJoin(suggested, eq(leads.suggestedSalesUserId, suggested.id))
    .where(and(...where))
    .orderBy(desc(leads.id))
    .all();
}

export type LeadListRow = Awaited<ReturnType<typeof listLeads>>[number];

export async function getLeadDetail(v: Viewer, id: number) {
  const lead = await loadLead(id);
  if (!lead) return null;
  const access = await leadAccessFor(v, lead);
  if (!access.read) return null;
  const nameOf = async (uid: number | null) =>
    uid ? ((await db.select({ name: users.name }).from(users).where(eq(users.id, uid)).get())?.name ?? null) : null;

  const [leadOwnerName, salesOwnerName, suggestedSalesName, timeline, requirements] = await Promise.all([
    nameOf(lead.leadOwnerUserId),
    nameOf(lead.salesOwnerUserId),
    nameOf(lead.suggestedSalesUserId),
    activityRows(eq(activities.leadId, id)),
    db
      .select({ id: opportunities.id, title: opportunities.title, stage: opportunities.stage, createdAt: opportunities.createdAt })
      .from(opportunities)
      .where(eq(opportunities.leadId, id))
      .orderBy(desc(opportunities.id))
      .all(),
  ]);
  const canRaise = (v.role === 'admin' || v.role === 'sales') && access.edit && canRaiseRequirement(lead.status);
  const canAssign = lead.handedOffAt !== null && (v.role === 'admin' || (v.role === 'sales' && v.isTeamLead));
  return {
    lead: { ...lead, leadOwnerName, salesOwnerName, suggestedSalesName },
    activities: timeline,
    requirements,
    access,
    canRaise,
    canAssign,
    canHandOff: access.edit && lead.status === 'open' && (v.role === 'admin' || v.role === 'leadgen'),
  };
}

/** Q5: a lead on an existing client — account growth, with no prospect behind it. */
export async function createLeadOnClient(v: Viewer, data: LeadCreateInput) {
  const c = await db.select({ name: clients.companyName }).from(clients).where(eq(clients.id, data.clientId)).get();
  if (!c) throw new LeadgenError('Selected client no longer exists');
  const { clientId, ...fields } = data;
  return db
    .insert(leads)
    .values({
      ...fields,
      clientId,
      companyName: c.name,
      status: 'open',
      leadOwnerUserId: v.role === 'leadgen' ? v.uid || null : null,
      createdByUserId: v.uid || null,
      updatedAt: now(),
    })
    .returning()
    .get();
}

async function readableLead(v: Viewer, id: number) {
  const lead = await loadLead(id);
  if (!lead) throw notFound('Lead');
  const access = await leadAccessFor(v, lead);
  if (!access.read) throw notFound('Lead');
  return { lead, access };
}

export async function updateLead(v: Viewer, id: number, data: LeadUpdateInput) {
  const { lead, access } = await readableLead(v, id);
  if (!access.edit) throw forbidden('You cannot edit this lead');
  const { status: requested, closedReason, ...fields } = data;
  const status = requested ?? lead.status;
  const moveError = leadMoveError(lead.status, status, closedReason);
  if (moveError) throw new LeadgenError(moveError);

  // Back to `open` hands the lead back to Leadgen: it leaves the Sales queue
  // and whoever held it there.
  const reopened = status === 'open' && lead.status !== 'open';
  return db
    .update(leads)
    .set({
      ...fields,
      summary: fields.summary ?? null,
      status,
      closedReason: status === 'closed_lost' ? closedReason : null,
      ...(reopened ? { handedOffAt: null, salesOwnerUserId: null } : {}),
      updatedAt: now(),
    })
    .where(eq(leads.id, id))
    .returning()
    .get();
}

/** Q2: Leadgen hands the lead to the Sales queue, optionally suggesting who should take it. */
export async function handOffLead(v: Viewer, id: number, data: z.output<typeof leadHandoffSchema>) {
  const { lead, access } = await readableLead(v, id);
  if (!access.edit || (v.role !== 'leadgen' && v.role !== 'admin')) throw forbidden('You cannot hand off this lead');
  const moveError = leadMoveError(lead.status, 'handed_off');
  if (moveError || lead.status === 'handed_off') throw new LeadgenError(moveError ?? 'Already with Sales', 409);
  if (data.suggestedSalesUserId !== null) await requireMember(db, data.suggestedSalesUserId, 'sales', 'The suggested salesperson');
  return db
    .update(leads)
    .set({ status: 'handed_off', handedOffAt: now(), suggestedSalesUserId: data.suggestedSalesUserId, updatedAt: now() })
    .where(and(eq(leads.id, id), eq(leads.status, 'open')))
    .returning()
    .get();
}

/** Q2: a Sales head (within the team) or Admin sets who in Sales owns it. */
export async function assignLead(v: Viewer, id: number, data: z.output<typeof leadAssignSchema>) {
  const { lead } = await readableLead(v, id);
  if (!lead.handedOffAt) throw new LeadgenError('Hand the lead to Sales before assigning it', 409);
  if (!(await canSetOwner(v, 'sales', data.salesOwnerUserId))) throw forbidden('Only a Sales head or Admin can assign a lead');
  if (data.salesOwnerUserId !== null) await requireMember(db, data.salesOwnerUserId, 'sales', 'The salesperson');
  return db
    .update(leads)
    .set({ salesOwnerUserId: data.salesOwnerUserId, updatedAt: now() })
    .where(eq(leads.id, id))
    .returning()
    .get();
}

/**
 * R5, before the requirement is created: may this viewer raise a requirement
 * from this lead, and what does it inherit? Only Sales (on a lead
 * they hold) and Admin; never Leadgen, who may still create requirements
 * directly (Q7). The lead moves to `requirement_raised` in the same
 * transaction via `markRequirementRaised`.
 */
export async function leadForRequirement(tx: Executor, v: Viewer, leadId: number) {
  const lead = await loadLead(leadId, tx);
  if (!lead) throw notFound('Lead');
  const access = await leadAccessFor(v, lead);
  if (!access.read) throw notFound('Lead');
  if ((v.role !== 'sales' && v.role !== 'admin') || !access.edit) {
    throw forbidden('Only the salesperson holding this lead can raise a requirement from it');
  }
  if (!canRaiseRequirement(lead.status)) {
    throw new LeadgenError('Requirements are raised from a lead once it is with Sales', 409);
  }
  return lead;
}

export async function markRequirementRaised(tx: Executor, leadId: number) {
  await tx
    .update(leads)
    .set({ status: 'requirement_raised', updatedAt: now() })
    .where(and(eq(leads.id, leadId), eq(leads.status, 'handed_off')))
    .run();
}

/* ── Pickers ───────────────────────────────────────────────── */

/** Active accounts of a role, for owner and salesperson pickers. */
export async function teamOptions(role: 'leadgen' | 'sales') {
  return db
    .select({ id: users.id, name: users.name, isTeamLead: users.isTeamLead })
    .from(users)
    .where(and(eq(users.role, role), eq(users.active, true)))
    .orderBy(users.name)
    .all();
}

export async function clientOptions() {
  return db.select({ id: clients.id, name: clients.companyName }).from(clients).orderBy(clients.companyName).all();
}
