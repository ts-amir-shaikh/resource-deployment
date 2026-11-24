import { and, eq, sql } from 'drizzle-orm';
import { clients, invoices, projects } from '@/lib/schema';
import { invoicesParams } from './params';
import { paginate } from './paginate';
import { AGING_BUCKETS, bucketFor, daysPastDue, type AgingBucket } from './aging';
import { CURRENCY_ORDER, addTo, isCurrency, round2, toMoney, type Currency } from './money';
import type { EndpointSpec } from './handler';
import type { InvoicesReport } from './types';

/**
 * GET /api/reporting/v1/invoices — invoiced, outstanding, overdue and aging.
 *
 * Amount basis is amount + GST, the same basis as getInvoiceSummary() in
 * lib/queries.ts, which tests/reporting-parity.test.ts reconciles against.
 *
 * Definitions:
 *   invoiced         raised, pending_collection or collected
 *   notRaised        drafts; NOT invoiced, reported on their own
 *   outstanding      raised + pending_collection
 *   overdue          outstanding with a due date strictly before as_of
 *   markedCollected  status = collected. A status, NOT a verified cash receipt:
 *                    the app has no payments table and no bank or Tally link.
 *
 * Dates are Asia/Kolkata calendar dates; getInvoiceSummary() uses the UTC date,
 * so the two can differ for invoices due "today" late in the Indian evening.
 *
 * Not selected, by design: invoice numbers, notes, lines, resources, FX rate.
 */

const INVOICED = new Set(['raised', 'pending_collection', 'collected']);
const OUTSTANDING = new Set(['raised', 'pending_collection']);

type AgingRow = Record<AgingBucket, number>;
const emptyAging = (): AgingRow => ({ notYetDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, noDueDate: 0 });

export const invoicesEndpoint: EndpointSpec<typeof invoicesParams, InvoicesReport> = {
  scope: 'invoices',
  schema: invoicesParams,
  validate: (p, { today }) => (p.as_of && p.as_of > today ? { as_of: 'as_of cannot be in the future' } : null),
  async run(p, { db, asOf }) {
    const filters = [];
    if (p.currency) filters.push(eq(invoices.currency, p.currency));
    if (p.client_id) filters.push(eq(projects.clientId, p.client_id));
    // Drafts have no invoice date yet, so their period end stands in for it.
    const effectiveDate = sql`coalesce(${invoices.invoiceDate}, ${invoices.periodTo})`;
    if (p.from) filters.push(sql`${effectiveDate} >= ${p.from}`);
    if (p.to) filters.push(sql`${effectiveDate} <= ${p.to}`);

    const rows = await db
      .select({
        clientId: clients.id,
        clientName: clients.companyName,
        currency: invoices.currency,
        status: invoices.status,
        dueDate: invoices.dueDate,
        amount: sql<number>`coalesce(sum(${invoices.amount} + ${invoices.gstAmount}), 0)`,
        n: sql<number>`count(*)`,
      })
      .from(invoices)
      .innerJoin(projects, eq(invoices.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(filters.length ? and(...filters) : undefined)
      .groupBy(clients.id, invoices.currency, invoices.status, invoices.dueDate)
      .all();

    const invoiced = new Map<Currency, number>();
    const notRaised = new Map<Currency, number>();
    const outstanding = new Map<Currency, number>();
    const overdue = new Map<Currency, number>();
    const collected = new Map<Currency, number>();
    const aging = new Map<Currency, AgingRow>();
    let overdueCount = 0;

    type ClientRow = {
      clientId: number;
      clientName: string;
      currency: Currency;
      invoiced: number;
      outstanding: number;
      overdue: number;
      markedCollected: number;
      invoiceCount: number;
      oldest: number | null;
    };
    const perClient = new Map<string, ClientRow>();

    for (const r of rows) {
      if (!isCurrency(r.currency)) continue;
      const cur = r.currency;
      const key = `${r.clientId}|${cur}`;
      const c =
        perClient.get(key) ??
        ({ clientId: r.clientId, clientName: r.clientName, currency: cur, invoiced: 0, outstanding: 0, overdue: 0, markedCollected: 0, invoiceCount: 0, oldest: null } as ClientRow);
      perClient.set(key, c);

      if (r.status === 'not_raised') {
        addTo(notRaised, cur, r.amount);
        continue;
      }
      if (!INVOICED.has(r.status)) continue;

      addTo(invoiced, cur, r.amount);
      c.invoiced += r.amount;
      c.invoiceCount += r.n;

      if (r.status === 'collected') {
        addTo(collected, cur, r.amount);
        c.markedCollected += r.amount;
      }
      if (OUTSTANDING.has(r.status)) {
        addTo(outstanding, cur, r.amount);
        c.outstanding += r.amount;
        const row = aging.get(cur) ?? emptyAging();
        row[bucketFor(r.dueDate, asOf)] += r.amount;
        aging.set(cur, row);

        const days = daysPastDue(r.dueDate, asOf);
        if (days !== null && days > 0) {
          addTo(overdue, cur, r.amount);
          c.overdue += r.amount;
          overdueCount += r.n;
          c.oldest = c.oldest === null ? days : Math.max(c.oldest, days);
        }
      }
    }

    const agingRows = CURRENCY_ORDER.filter((cur) => aging.has(cur)).map((currency) => {
      const row = aging.get(currency) as AgingRow;
      const out: Record<string, number | string> = { currency };
      for (const b of AGING_BUCKETS) out[b] = round2(row[b]);
      return out as unknown as InvoicesReport['aging'][number];
    });

    const clientRows = [...perClient.values()]
      .map((c) => ({
        clientId: c.clientId,
        clientName: c.clientName,
        currency: c.currency,
        invoiced: round2(c.invoiced),
        outstanding: round2(c.outstanding),
        overdue: round2(c.overdue),
        markedCollected: round2(c.markedCollected),
        invoiceCount: c.invoiceCount,
        oldestOverdueDays: c.oldest,
      }))
      // A client with only drafts has nothing invoiced; leave it out of the invoiced list.
      .filter((c) => c.invoiceCount > 0)
      .sort(
        (a, b) =>
          a.clientName.localeCompare(b.clientName) ||
          a.clientId - b.clientId ||
          CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency),
      );

    const { page, pagination } = paginate(clientRows, p.limit, p.offset);
    return {
      data: {
        totals: {
          invoiced: toMoney(invoiced),
          notRaised: toMoney(notRaised),
          outstanding: toMoney(outstanding),
          overdue: toMoney(overdue),
          markedCollected: toMoney(collected),
          overdueCount,
        },
        aging: agingRows,
        clients: page,
      },
      notes: [
        'All amounts are amount plus GST, per currency, never converted.',
        'markedCollected means the invoice status is collected. It is not a verified cash receipt: the application has no payments record.',
        'Aging covers outstanding invoices only (raised and pending collection), in days past due date at the as-of date (Asia/Kolkata). Aging figures are amounts, not counts. An invoice due on the as-of date is not yet due.',
        'notRaised are drafts and are not part of invoiced. A date filter uses the invoice date, or the period end for drafts.',
        'invoiceCount counts invoiced invoices (raised, pending collection, collected) for that client and currency.',
      ],
      pagination,
      rowCount: page.length,
    };
  },
};
