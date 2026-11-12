import { beforeEach, describe, expect, it } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { DDL } from './ddl';
import * as schema from './schema';
import { invoiceCreditNotes, invoiceReceipts, invoices, invoiceResources } from './schema';
import { loadLedger, resettleInvoice } from './invoice-ledger';
import { buildMonthlyDrafts } from './invoice-drafts';

/**
 * Real SQL on an in-memory libSQL database built from lib/ddl.ts: the ledger
 * re-derives status inside a transaction, and the monthly drafter writes
 * invoices and lines and never twice.
 */

let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
// The ledger takes the app's Executor type; the in-memory handle is the same shape.
const ex = () => db as never;

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  await client.executeMultiple(DDL);
  db = drizzle(client, { schema });
  await client.execute("insert into clients(company_name) values ('Acme')");
  await client.execute("insert into projects(client_id, project_name) values (1, 'Alpha')");
  await client.execute("insert into resources(name, email) values ('Priya', 'p@x.io'), ('Ravi', 'r@x.io')");
});

async function raised(status = 'raised', amount = 1000, gst = 180) {
  const r = await db
    .insert(invoices)
    .values({ projectId: 1, periodFrom: '2026-10-01', periodTo: '2026-10-31', amount, gstAmount: gst, status: status as never })
    .returning({ id: invoices.id })
    .get();
  return r.id;
}
const pay = (invoiceId: number, amount: number, tds = 0, reversesId: number | null = null) =>
  db.insert(invoiceReceipts).values({ invoiceId, receivedDate: '2026-11-02', amount, tdsDeducted: tds, reversesId }).returning({ id: invoiceReceipts.id }).get();

describe('resettleInvoice', () => {
  it('walks Raised -> Pending to Collect -> Collected as payments arrive', async () => {
    const id = await raised();
    await pay(id, 500);
    await resettleInvoice(ex(), id, '2026-11-02');
    expect((await loadLedger(ex(), id))!.invoice.status).toBe('pending_collection');

    await pay(id, 600, 80);
    await resettleInvoice(ex(), id, '2026-11-05');
    const done = (await loadLedger(ex(), id))!;
    expect(done.invoice.status).toBe('collected');
    expect(done.invoice.collectedDate).toBe('2026-11-05');
    expect(done.settlement.outstanding).toBe(0);
  });

  it('reopens a Collected invoice when its receipt is reversed, and clears the date', async () => {
    const id = await raised();
    const p = await pay(id, 1180);
    await resettleInvoice(ex(), id, '2026-11-02');
    await pay(id, -1180, 0, p.id);
    await resettleInvoice(ex(), id);
    const l = (await loadLedger(ex(), id))!;
    expect(l.invoice.status).toBe('pending_collection');
    expect(l.invoice.collectedDate).toBeNull();
  });

  it('collects an invoice when a credit note brings the total down to what was paid', async () => {
    const id = await raised();
    await pay(id, 590);
    await db.insert(invoiceCreditNotes).values({ invoiceId: id, creditDate: '2026-11-03', amount: 500, gstAmount: 90, reason: 'Scope cut' });
    await resettleInvoice(ex(), id, '2026-11-03');
    expect((await loadLedger(ex(), id))!.invoice.status).toBe('collected');
  });

  it('does not touch a legacy Collected invoice with no receipts', async () => {
    const id = await raised('collected');
    await resettleInvoice(ex(), id);
    expect((await loadLedger(ex(), id))!.invoice.status).toBe('collected');
  });
});

describe('buildMonthlyDrafts', () => {
  const deps = {
    holidaysFor: async () => new Set<string>(),
    leaveFor: async <L,>(_tx: unknown, line: L) => ({ ...line, leaveFromTimesheet: false }),
  };
  const deploy = (resourceId: number, rate: number, start = '2026-01-01', end: string | null = null, type = 'billable') =>
    client.execute({
      sql: 'insert into deployments(resource_id, project_id, start_date, end_date, billing_amount, deployment_type) values (?, 1, ?, ?, ?, ?)',
      args: [resourceId, start, end, rate, type],
    });

  it('drafts one Not Raised invoice for a project with a line per resource', async () => {
    await deploy(1, 220_000);
    await deploy(2, 110_000);
    const r = await buildMonthlyDrafts(ex(), '2026-10', deps as never);
    expect(r.created).toHaveLength(1);
    expect(r.created[0]).toMatchObject({ projectId: 1, lines: 2, amount: 330_000 });
    const inv = (await db.select().from(invoices).all())[0];
    expect(inv).toMatchObject({ status: 'not_raised', scope: 'team', gstAmount: 59_400, periodFrom: '2026-10-01', periodTo: '2026-10-31' });
    expect(await db.select().from(invoiceResources).where(eq(invoiceResources.invoiceId, inv.id)).all()).toHaveLength(2);
  });

  it('pro-rates a resource who joins mid-month on the server', async () => {
    await deploy(1, 220_000, '2026-10-16');
    const r = await buildMonthlyDrafts(ex(), '2026-10', deps as never);
    // 22 working days; on site 16 of 31 days -> 11.5 days of 22.
    expect(r.created[0].amount).toBe(Math.round((220_000 * 11.5) / 22));
  });

  it('is idempotent for a month', async () => {
    await deploy(1, 100_000);
    await buildMonthlyDrafts(ex(), '2026-10', deps as never);
    const again = await buildMonthlyDrafts(ex(), '2026-10', deps as never);
    expect(again.created).toHaveLength(0);
    expect(again.skipped[0].reason).toMatch(/already exists/);
    expect(await db.select().from(invoices).all()).toHaveLength(1);
  });

  it('ignores shadow deployments, ended ones, and zero rates', async () => {
    await deploy(1, 100_000, '2026-01-01', null, 'shadow');
    await deploy(2, 100_000, '2026-01-01', '2026-09-30');
    const r = await buildMonthlyDrafts(ex(), '2026-10', deps as never);
    expect(r.created).toHaveLength(0);
    expect(await db.select().from(invoices).all()).toHaveLength(0);
  });

  it('leaves a foreign-currency project to be raised by hand', async () => {
    await client.execute({ sql: "insert into deployments(resource_id, project_id, start_date, billing_amount, currency) values (1, 1, '2026-01-01', 5000, 'USD')", args: [] });
    const r = await buildMonthlyDrafts(ex(), '2026-10', deps as never);
    expect(r.created).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/exchange rate/);
  });
});
