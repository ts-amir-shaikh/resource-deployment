import 'server-only';
import { and, asc, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { db, type Executor } from './db';
import { holidaysBetween } from './holidays';
import {
  canMove,
  expandLeave,
  leaveDays,
  rangesOverlap,
  MAX_LEAVE_SPAN_DAYS,
  type LeaveStatus,
  type LeaveType,
} from './leave-rules';
import { clients, deployments, leaveRequests, projects, resources, timesheetEntries, users } from './schema';
import { datesBetween } from './timesheet-rules';

/**
 * Server side of leave requests (FSD-21).
 *
 * A resource reaches only their own requests (the resource record their
 * account is linked to). The Resource Manager and Admin see the queue, which
 * carries names, dates and the reason — no money. Days are counted from the
 * dates and the holiday calendar each time (lib/leave-rules.ts), never stored.
 */

export class LeaveError extends Error {
  constructor(
    message: string,
    readonly status: number = 422,
  ) {
    super(message);
  }
}

/** One working day of leave, as the timesheet and the invoice feed read it. */
export type LeaveDayRow = { date: string; fraction: number; type: LeaveType; status: LeaveStatus };

/**
 * Leave days of one resource inside a range, from requests in the given
 * statuses. The holidays decide which days of a request cost anything, so the
 * caller passes the set that applies to what it is measuring.
 */
export async function leaveDaysInRange(
  tx: Executor,
  resourceId: number,
  from: string,
  to: string,
  holidays: ReadonlySet<string>,
  statuses: readonly LeaveStatus[] = ['approved'],
): Promise<LeaveDayRow[]> {
  const rows = await tx
    .select({
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      halfDay: leaveRequests.halfDay,
      leaveType: leaveRequests.leaveType,
      status: leaveRequests.status,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.resourceId, resourceId),
        inArray(leaveRequests.status, [...statuses]),
        lte(leaveRequests.startDate, to),
        gte(leaveRequests.endDate, from),
      ),
    )
    .all();
  const out: LeaveDayRow[] = [];
  for (const r of rows) {
    for (const d of expandLeave(r, holidays)) {
      if (d.date >= from && d.date <= to) out.push({ date: d.date, fraction: d.fraction, type: r.leaveType, status: r.status });
    }
  }
  return out;
}

/** The holidays that apply to a person: company-wide, plus their clients'. */
async function holidaysFor(tx: Executor, resourceId: number, from: string, to: string): Promise<Set<string>> {
  const rows = await tx
    .select({ clientId: projects.clientId })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .where(eq(deployments.resourceId, resourceId))
    .all();
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  return new Set((await holidaysBetween(tx, from, to, clientIds)).map((h) => h.date));
}

/* ── The resource's own leave ──────────────────────────────── */

export type MyLeave = {
  id: number;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  leaveType: LeaveType;
  reason: string | null;
  status: LeaveStatus;
  /** Working days it takes, counted now. */
  days: number;
  rejectionReason: string | null;
};

export async function myLeaves(resourceId: number): Promise<MyLeave[]> {
  const rows = await db
    .select({
      id: leaveRequests.id,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      halfDay: leaveRequests.halfDay,
      leaveType: leaveRequests.leaveType,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      rejectionReason: leaveRequests.rejectionReason,
    })
    .from(leaveRequests)
    .where(eq(leaveRequests.resourceId, resourceId))
    .orderBy(desc(leaveRequests.startDate), desc(leaveRequests.id))
    .all();
  if (!rows.length) return [];
  const from = rows.reduce((m, r) => (r.startDate < m ? r.startDate : m), rows[0].startDate);
  const to = rows.reduce((m, r) => (r.endDate > m ? r.endDate : m), rows[0].endDate);
  const hol = await holidaysFor(db, resourceId, from, to);
  return rows.map((r) => ({ ...r, days: leaveDays(r, hol) }));
}

export type LeaveInput = { startDate: string; endDate: string; halfDay: boolean; leaveType: LeaveType; reason?: string };

export async function applyLeave(resourceId: number, uid: number, input: LeaveInput): Promise<MyLeave> {
  if (datesBetween(input.startDate, input.endDate).length > MAX_LEAVE_SPAN_DAYS) {
    throw new LeaveError(`A request can span at most ${MAX_LEAVE_SPAN_DAYS} days. Split it into two.`);
  }
  return db.transaction(async (tx) => {
    const hol = await holidaysFor(tx, resourceId, input.startDate, input.endDate);
    const days = expandLeave(input, hol);
    if (days.length === 0) {
      throw new LeaveError('Those dates have no working days: they are weekends or holidays.');
    }

    // Two requests for the same day would take that day off the bill twice.
    const mine = await tx
      .select({ startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, status: leaveRequests.status })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.resourceId, resourceId), inArray(leaveRequests.status, ['pending', 'approved'])))
      .all();
    const clash = mine.find((r) => rangesOverlap(r, input));
    if (clash) {
      throw new LeaveError(`You already have ${clash.status} leave from ${clash.startDate} to ${clash.endDate} that overlaps these dates.`, 409);
    }

    // Time already submitted or approved on one of those days cannot be
    // replaced by leave from under the approver.
    const dayList = days.map((d) => d.date);
    const busy = await tx
      .select({ date: timesheetEntries.entryDate })
      .from(timesheetEntries)
      .innerJoin(deployments, eq(timesheetEntries.deploymentId, deployments.id))
      .where(
        and(
          eq(deployments.resourceId, resourceId),
          inArray(timesheetEntries.entryDate, dayList),
          inArray(timesheetEntries.status, ['submitted', 'approved']),
          ne(timesheetEntries.entryType, 'holiday'),
        ),
      )
      .all();
    if (busy.length) {
      throw new LeaveError(`Time is already submitted or approved on ${[...new Set(busy.map((b) => b.date))].sort()[0]}. Leave cannot be added over it.`, 409);
    }

    const row = await tx
      .insert(leaveRequests)
      .values({
        resourceId,
        startDate: input.startDate,
        endDate: input.endDate,
        halfDay: input.halfDay,
        leaveType: input.leaveType,
        reason: input.reason ?? null,
        status: 'pending',
        createdByUserId: uid || null,
      })
      .returning()
      .get();
    return {
      id: row.id,
      startDate: row.startDate,
      endDate: row.endDate,
      halfDay: row.halfDay,
      leaveType: row.leaveType,
      reason: row.reason,
      status: row.status,
      days: days.reduce((s, d) => s + d.fraction, 0),
      rejectionReason: null,
    };
  });
}

/** A resource withdraws a request that is still pending. Anything decided stays. */
export async function cancelLeave(resourceId: number, id: number): Promise<void> {
  const res = await db
    .update(leaveRequests)
    .set({ status: 'cancelled' })
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.resourceId, resourceId), eq(leaveRequests.status, 'pending')))
    .run();
  if (res.rowsAffected === 0) {
    // Someone else's request answers like a missing one.
    const own = await db
      .select({ status: leaveRequests.status })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.resourceId, resourceId)))
      .get();
    if (!own) throw new LeaveError('Leave request not found', 404);
    if (!canMove(own.status, 'cancelled')) throw new LeaveError('Only a pending request can be withdrawn.', 409);
  }
}

/* ── The approval queue ────────────────────────────────────── */

export type QueuedLeave = MyLeave & {
  resourceName: string;
  clients: string[];
  decidedBy: string | null;
};

export type LeaveQueue = { pending: QueuedLeave[]; recent: QueuedLeave[] };

/** Pending requests, and the last few decided. Names, dates and reasons only. */
export async function leaveQueue(): Promise<LeaveQueue> {
  const rows = await db
    .select({
      id: leaveRequests.id,
      resourceId: leaveRequests.resourceId,
      resourceName: resources.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      halfDay: leaveRequests.halfDay,
      leaveType: leaveRequests.leaveType,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      rejectionReason: leaveRequests.rejectionReason,
      decidedBy: users.name,
    })
    .from(leaveRequests)
    .innerJoin(resources, eq(leaveRequests.resourceId, resources.id))
    .leftJoin(users, eq(leaveRequests.reviewedByUserId, users.id))
    .where(inArray(leaveRequests.status, ['pending', 'approved', 'rejected']))
    .orderBy(asc(leaveRequests.startDate), asc(leaveRequests.id))
    .all();
  if (!rows.length) return { pending: [], recent: [] };

  const resourceIds = [...new Set(rows.map((r) => r.resourceId))];
  const deps = await db
    .select({ resourceId: deployments.resourceId, clientName: clients.companyName, clientId: clients.id })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(inArray(deployments.resourceId, resourceIds), eq(deployments.status, 'active')))
    .all();

  const out: QueuedLeave[] = [];
  const holCache = new Map<number, Set<string>>();
  for (const r of rows) {
    let hol = holCache.get(r.resourceId);
    if (!hol) {
      hol = await holidaysFor(db, r.resourceId, r.startDate, r.endDate);
      holCache.set(r.resourceId, hol);
    }
    const { resourceId, ...rest } = r;
    out.push({
      ...rest,
      days: leaveDays(r, hol),
      clients: [...new Set(deps.filter((d) => d.resourceId === resourceId).map((d) => d.clientName))],
    });
  }
  return {
    pending: out.filter((r) => r.status === 'pending'),
    // Newest decisions first, and only the last few: this is the approver's context, not an archive.
    recent: out.filter((r) => r.status !== 'pending').sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 15),
  };
}

/**
 * Approves or rejects one pending request. The approver may change paid to
 * unpaid (or back) when approving: whether a day is paid depends on what the
 * client's agreement allows, which the resource cannot always know.
 */
export async function reviewLeave(
  uid: number,
  input: { id: number; action: 'approve' | 'reject'; leaveType?: LeaveType; reason?: string },
): Promise<void> {
  const res = await db
    .update(leaveRequests)
    .set({
      status: input.action === 'approve' ? 'approved' : 'rejected',
      ...(input.action === 'approve' && input.leaveType ? { leaveType: input.leaveType } : {}),
      reviewedByUserId: uid || null,
      reviewedAt: new Date().toISOString(),
      rejectionReason: input.action === 'reject' ? (input.reason ?? null) : null,
    })
    // Each move is checked against the status it was read with, so two
    // approvers acting at once cannot both succeed.
    .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.status, 'pending')))
    .run();
  if (res.rowsAffected === 0) {
    const row = await db.select({ status: leaveRequests.status }).from(leaveRequests).where(eq(leaveRequests.id, input.id)).get();
    if (!row) throw new LeaveError('Leave request not found', 404);
    throw new LeaveError(`This request is already ${row.status}.`, 409);
  }
}
