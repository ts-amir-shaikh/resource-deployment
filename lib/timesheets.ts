import 'server-only';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { db, type Executor } from './db';
import {
  clients,
  deployments,
  holidays,
  projects,
  resources,
  timesheetEntries,
  users,
} from './schema';
import {
  effectiveVersion,
  isEditable,
  periodKey,
  periodSummary,
  type ApprovalCadence,
  type EntryStatus,
  type EntryType,
  type PeriodSummary,
  type TimesheetVersion,
} from './timesheet-rules';

/**
 * Server-side reads and writes for M65. The arithmetic is in
 * lib/timesheet-rules.ts; this file decides who may touch which rows.
 *
 * Two rules hold everywhere below:
 *
 * - A resource reaches only the deployments of the resource record its
 *   account is linked to (users.resource_id). Middleware opens the door to
 *   /api/timesheets/mine; this file is what keeps it to *their* rows.
 * - Every shape returned to a resource or a resource manager is built field by
 *   field. Deployments carry billing, commission and overhead, and resources
 *   carry CTC; a select-everything that is trimmed later is how those leak
 *   the moment someone adds a column.
 */

/** A refusal the route turns into a 4xx with this message. */
export class TimesheetError extends Error {
  constructor(
    message: string,
    readonly status: number = 422,
  ) {
    super(message);
  }
}

/* ── Who is asking ─────────────────────────────────────────── */

/** The resource record a resource account is linked to, or null. */
export async function linkedResourceId(uid: number): Promise<number | null> {
  if (!uid) return null;
  const row = await db.select({ resourceId: users.resourceId }).from(users).where(eq(users.id, uid)).get();
  return row?.resourceId ?? null;
}

/* ── The resource's own view ───────────────────────────────── */

/** What a resource may see of a deployment. No money field is in this list. */
export type MyDeployment = {
  id: number;
  projectName: string;
  clientName: string;
  startDate: string;
  endDate: string | null;
  status: string;
  version: TimesheetVersion;
  fullDayHours: number;
};

export type MyEntry = {
  id: number;
  deploymentId: number;
  entryDate: string;
  entryType: EntryType;
  hours: number;
  task: string | null;
  status: EntryStatus;
  rejectionReason: string | null;
};

export type MyHoliday = { date: string; name: string; clientName: string | null };

export type MyTimesheet = {
  profile: { name: string; email: string; designation: string | null };
  deployments: MyDeployment[];
  entries: MyEntry[];
  holidays: MyHoliday[];
};

async function myDeployments(resourceId: number): Promise<(MyDeployment & { clientId: number })[]> {
  const rows = await db
    .select({
      id: deployments.id,
      projectName: projects.projectName,
      clientId: clients.id,
      clientName: clients.companyName,
      startDate: deployments.startDate,
      endDate: deployments.endDate,
      status: deployments.status,
      deploymentVersion: deployments.timesheetVersion,
      projectVersion: projects.timesheetVersion,
      fullDayHours: deployments.fullDayHours,
    })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(eq(deployments.resourceId, resourceId))
    .orderBy(asc(deployments.startDate))
    .all();
  return rows.map(({ deploymentVersion, projectVersion, ...r }) => ({
    ...r,
    version: effectiveVersion(deploymentVersion, projectVersion),
  }));
}

/** Company-wide holidays plus those of the given clients, inside a range. */
export async function holidaysBetween(
  tx: Executor,
  from: string,
  to: string,
  clientIds: number[],
): Promise<MyHoliday[]> {
  const scope = clientIds.length
    ? or(isNull(holidays.clientId), inArray(holidays.clientId, clientIds))
    : isNull(holidays.clientId);
  const rows = await tx
    .select({ date: holidays.holidayDate, name: holidays.name, clientName: clients.companyName })
    .from(holidays)
    .leftJoin(clients, eq(holidays.clientId, clients.id))
    .where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to), scope))
    .orderBy(asc(holidays.holidayDate))
    .all();
  return rows;
}

/** Everything the /timesheet screen needs for one date range. */
export async function loadMyTimesheet(resourceId: number, from: string, to: string): Promise<MyTimesheet> {
  const profile = await db
    .select({ name: resources.name, email: resources.email, designation: resources.designation })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .get();
  if (!profile) throw new TimesheetError('Your account is linked to a resource that no longer exists.', 404);

  const deps = await myDeployments(resourceId);
  const ids = deps.map((d) => d.id);
  const entries = ids.length
    ? await db
        .select({
          id: timesheetEntries.id,
          deploymentId: timesheetEntries.deploymentId,
          entryDate: timesheetEntries.entryDate,
          entryType: timesheetEntries.entryType,
          hours: timesheetEntries.hours,
          task: timesheetEntries.task,
          status: timesheetEntries.status,
          rejectionReason: timesheetEntries.rejectionReason,
        })
        .from(timesheetEntries)
        .where(
          and(
            inArray(timesheetEntries.deploymentId, ids),
            gte(timesheetEntries.entryDate, from),
            lte(timesheetEntries.entryDate, to),
          ),
        )
        .orderBy(asc(timesheetEntries.entryDate), asc(timesheetEntries.id))
        .all()
    : [];

  const clientIds = [...new Set(deps.map((d) => d.clientId))];
  return {
    profile,
    deployments: deps.map(({ clientId: _clientId, ...d }) => d),
    entries,
    holidays: await holidaysBetween(db, from, to, clientIds),
  };
}

/* ── Writing a day ─────────────────────────────────────────── */

async function ownDeployment(tx: Executor, resourceId: number, deploymentId: number) {
  const dep = await tx
    .select({
      id: deployments.id,
      startDate: deployments.startDate,
      endDate: deployments.endDate,
      deploymentVersion: deployments.timesheetVersion,
      projectVersion: projects.timesheetVersion,
    })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .where(and(eq(deployments.id, deploymentId), eq(deployments.resourceId, resourceId)))
    .get();
  // Someone else's deployment answers exactly as a missing one does, so the
  // response cannot be used to learn which deployment ids exist.
  if (!dep) throw new TimesheetError('Deployment not found', 404);
  return dep;
}

/**
 * Replaces one day of one deployment with the rows given. Only a day that is
 * still a draft, or was rejected, can be changed; whatever was there becomes a
 * fresh draft. An empty `rows` clears the day.
 */
export async function saveDay(
  resourceId: number,
  uid: number,
  input: { deploymentId: number; date: string; rows: { entryType: EntryType; hours: number; task?: string }[] },
): Promise<void> {
  await db.transaction(async (tx) => {
    const dep = await ownDeployment(tx, resourceId, input.deploymentId);
    if (input.date < dep.startDate || (dep.endDate && input.date > dep.endDate)) {
      throw new TimesheetError('That date is outside this deployment.');
    }
    const version = effectiveVersion(dep.deploymentVersion, dep.projectVersion);
    if (version === 'v1' && input.rows.length > 1) {
      throw new TimesheetError('This deployment takes one entry a day.');
    }

    const existing = await tx
      .select({ status: timesheetEntries.status })
      .from(timesheetEntries)
      .where(and(eq(timesheetEntries.deploymentId, dep.id), eq(timesheetEntries.entryDate, input.date)))
      .all();
    if (existing.some((e) => !isEditable(e.status))) {
      throw new TimesheetError('This day has been submitted or approved and can no longer be changed.', 409);
    }

    await tx
      .delete(timesheetEntries)
      .where(and(eq(timesheetEntries.deploymentId, dep.id), eq(timesheetEntries.entryDate, input.date)));
    for (const r of input.rows) {
      await tx
        .insert(timesheetEntries)
        .values({
          deploymentId: dep.id,
          entryDate: input.date,
          entryType: r.entryType,
          hours: r.hours,
          task: r.task ?? null,
          status: 'draft',
          createdByUserId: uid || null,
        })
        .run();
    }
  });
}

/**
 * Submits every draft or rejected day of the resource's own deployments in a
 * range. A rejected day goes back for approval as it stands — the resource may
 * resubmit without changing it, if the rejection was a misunderstanding.
 */
export async function submitRange(
  resourceId: number,
  input: { from: string; to: string; deploymentId?: number },
): Promise<number> {
  const own = (await myDeployments(resourceId)).map((d) => d.id);
  const ids = input.deploymentId ? own.filter((id) => id === input.deploymentId) : own;
  if (input.deploymentId && ids.length === 0) throw new TimesheetError('Deployment not found', 404);
  if (ids.length === 0) return 0;

  const res = await db
    .update(timesheetEntries)
    .set({ status: 'submitted', submittedAt: new Date().toISOString(), rejectionReason: null })
    .where(
      and(
        inArray(timesheetEntries.deploymentId, ids),
        gte(timesheetEntries.entryDate, input.from),
        lte(timesheetEntries.entryDate, input.to),
        inArray(timesheetEntries.status, ['draft', 'rejected']),
      ),
    )
    .run();
  return res.rowsAffected;
}

/* ── The approval queue (G-RM-01) ──────────────────────────── */

export type QueueDay = {
  deploymentId: number;
  date: string;
  hours: number;
  rows: { entryType: EntryType; hours: number; task: string | null }[];
  submittedAt: string | null;
};

export type QueueGroup = {
  /** Stable key: deployment + cadence period. */
  key: string;
  deploymentId: number;
  resourceName: string;
  projectName: string;
  clientName: string;
  cadence: ApprovalCadence;
  period: string;
  fullDayHours: number;
  days: QueueDay[];
};

/**
 * Submitted days, grouped by deployment and by the deployment's cadence. The
 * shape is names, dates and hours — the resource manager approves time, and
 * has no use for what that time is billed at.
 */
export async function approvalQueue(): Promise<QueueGroup[]> {
  const rows = await db
    .select({
      deploymentId: timesheetEntries.deploymentId,
      entryDate: timesheetEntries.entryDate,
      entryType: timesheetEntries.entryType,
      hours: timesheetEntries.hours,
      task: timesheetEntries.task,
      submittedAt: timesheetEntries.submittedAt,
      resourceName: resources.name,
      projectName: projects.projectName,
      clientName: clients.companyName,
      cadence: deployments.approvalCadence,
      fullDayHours: deployments.fullDayHours,
    })
    .from(timesheetEntries)
    .innerJoin(deployments, eq(timesheetEntries.deploymentId, deployments.id))
    .innerJoin(resources, eq(deployments.resourceId, resources.id))
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(eq(timesheetEntries.status, 'submitted'))
    .orderBy(asc(resources.name), asc(timesheetEntries.entryDate), asc(timesheetEntries.id))
    .all();

  const groups = new Map<string, QueueGroup>();
  for (const r of rows) {
    const period = periodKey(r.entryDate, r.cadence);
    const key = `${r.deploymentId}:${period}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        deploymentId: r.deploymentId,
        resourceName: r.resourceName,
        projectName: r.projectName,
        clientName: r.clientName,
        cadence: r.cadence,
        period,
        fullDayHours: r.fullDayHours,
        days: [],
      };
      groups.set(key, g);
    }
    let day = g.days.find((d) => d.date === r.entryDate);
    if (!day) {
      day = { deploymentId: r.deploymentId, date: r.entryDate, hours: 0, rows: [], submittedAt: r.submittedAt };
      g.days.push(day);
    }
    day.rows.push({ entryType: r.entryType, hours: r.hours, task: r.task });
    day.hours += r.hours;
  }
  return [...groups.values()];
}

/**
 * Approves or rejects whole days. Only submitted rows move: a day the
 * resource pulled back to draft in the meantime is left alone rather than
 * approved from under them. Returns how many days changed.
 */
export async function reviewDays(
  uid: number,
  input: { action: 'approve' | 'reject'; days: { deploymentId: number; date: string }[]; reason?: string },
): Promise<number> {
  const now = new Date().toISOString();
  let changed = 0;
  await db.transaction(async (tx) => {
    for (const d of input.days) {
      const res = await tx
        .update(timesheetEntries)
        .set({
          status: input.action === 'approve' ? 'approved' : 'rejected',
          reviewedByUserId: uid || null,
          reviewedAt: now,
          rejectionReason: input.action === 'reject' ? (input.reason ?? null) : null,
        })
        .where(
          and(
            eq(timesheetEntries.deploymentId, d.deploymentId),
            eq(timesheetEntries.entryDate, d.date),
            eq(timesheetEntries.status, 'submitted'),
          ),
        )
        .run();
      if (res.rowsAffected > 0) changed++;
    }
  });
  return changed;
}

/* ── The invoice feed (G-RES-04) ───────────────────────────── */

/**
 * Approved timesheet figures for one invoice line: a resource on a project
 * over the invoice period. Takes the transaction handle so an invoice save
 * reads the same state it writes against.
 *
 * Each deployment contributes only its own days inside the period, so a
 * resource who rolled off and back on within a month is counted once per day.
 */
export async function lineSummary(
  tx: Executor,
  q: { resourceId: number; projectId: number; from: string; to: string },
): Promise<PeriodSummary> {
  const deps = await tx
    .select({
      id: deployments.id,
      startDate: deployments.startDate,
      endDate: deployments.endDate,
      fullDayHours: deployments.fullDayHours,
      clientId: projects.clientId,
    })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .where(
      and(
        eq(deployments.resourceId, q.resourceId),
        eq(deployments.projectId, q.projectId),
        lte(deployments.startDate, q.to),
        or(isNull(deployments.endDate), gte(deployments.endDate, q.from)),
      ),
    )
    .all();

  const ids = deps.map((d) => d.id);
  const entries = ids.length
    ? await tx
        .select({
          deploymentId: timesheetEntries.deploymentId,
          entryDate: timesheetEntries.entryDate,
          entryType: timesheetEntries.entryType,
          hours: timesheetEntries.hours,
          status: timesheetEntries.status,
        })
        .from(timesheetEntries)
        .where(
          and(
            inArray(timesheetEntries.deploymentId, ids),
            gte(timesheetEntries.entryDate, q.from),
            lte(timesheetEntries.entryDate, q.to),
          ),
        )
        .all()
    : [];

  const clientIds = [...new Set(deps.map((d) => d.clientId))];
  const hol = new Set((await holidaysBetween(tx, q.from, q.to, clientIds)).map((h) => h.date));

  return periodSummary(
    deps.map((d) => ({
      from: d.startDate > q.from ? d.startDate : q.from,
      to: d.endDate && d.endDate < q.to ? d.endDate : q.to,
      fullDayHours: d.fullDayHours,
      entries: entries.filter((e) => e.deploymentId === d.id),
    })),
    hol,
  );
}

/**
 * Q3: the leave on an invoice line comes from timesheets when — and only
 * when — every expected day of the line's period is approved. Then the
 * approved figures replace whatever the request carried, the same way billed
 * days and the line amount are never taken from the request. Otherwise the
 * biller's figures stand, because a part-approved month would bill the
 * unapproved days as if they had been worked.
 */
export async function withTimesheetLeave<
  L extends { resourceId: number; paidLeaveDays: number; unpaidLeaveDays: number },
>(
  tx: Executor,
  line: L,
  invoice: { projectId: number; periodFrom: string; periodTo: string },
): Promise<L & { leaveFromTimesheet: boolean }> {
  const s = await lineSummary(tx, {
    resourceId: line.resourceId,
    projectId: invoice.projectId,
    from: invoice.periodFrom,
    to: invoice.periodTo,
  });
  if (!s.complete) return { ...line, leaveFromTimesheet: false };
  return {
    ...line,
    paidLeaveDays: s.paidLeaveDays,
    unpaidLeaveDays: s.unpaidLeaveDays,
    leaveFromTimesheet: true,
  };
}
