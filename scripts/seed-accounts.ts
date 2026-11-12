/**
 * Mock billing data for M62, so the Payments, Credit notes and Proforma panels,
 * the PO-consumption block and the client billing form have something to show.
 * Additive and idempotent:
 *
 * - fills client billing details only where all four are still empty;
 * - does nothing more if any receipt or credit note already exists;
 * - otherwise takes the first raised or pending invoice for a partial payment
 *   with TDS, the next for a credit note, and the first Not Raised one for a
 *   proforma number. It never updates a Collected invoice or deletes a row.
 *
 *   npm run db:migrate          # first: the new tables and columns must exist
 *   npm run db:seed-accounts
 *
 * Mock data only. Targets TURSO_DATABASE_URL when set, otherwise the local file.
 */
import { createClient } from '@libsql/client';

const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
const client = createClient({ url, authToken });
const today = new Date().toISOString().slice(0, 10);

async function main() {
  const { rows: t } = await client.execute("select name from sqlite_master where type='table' and name = 'invoice_credit_notes'");
  if (!t.length) {
    console.error('invoice_credit_notes does not exist yet. Run `npm run db:migrate` first.');
    process.exit(1);
  }

  const { rowsAffected } = await client.execute(
    `update clients set gstin = '27AAPFU0939F1ZV', billing_address = 'Mock address, Mumbai 400001',
       payment_terms = 'Net 30', default_due_days = 30
     where gstin is null and billing_address is null and payment_terms is null and default_due_days is null
       and id = (select min(id) from clients)`,
  );
  if (rowsAffected) console.log('  filled billing details on the first client');

  const rc = Number((await client.execute('select count(*) c from invoice_receipts')).rows[0].c);
  const cn = Number((await client.execute('select count(*) c from invoice_credit_notes')).rows[0].c);
  if (rc + cn > 0) {
    console.log(`Receipts (${rc}) or credit notes (${cn}) already exist: nothing more added.`);
    return;
  }

  const { rows: open } = await client.execute(
    "select id, amount, gst_amount from invoices where status in ('raised','pending_collection') order by id limit 2",
  );
  if (open[0]) {
    const total = Number(open[0].amount) + Number(open[0].gst_amount);
    const part = Math.round(total * 0.5);
    await client.execute({
      sql: "insert into invoice_receipts(invoice_id, received_date, amount, tds_deducted, note, source) values (?, ?, ?, ?, 'Mock part payment', 'manual')",
      args: [open[0].id, today, part, Math.round(Number(open[0].amount) * 0.02)],
    });
    await client.execute({ sql: "update invoices set status = 'pending_collection' where id = ? and status = 'raised'", args: [open[0].id] });
    console.log(`  part payment with TDS on invoice #${open[0].id}`);
  }
  if (open[1]) {
    await client.execute({
      sql: "insert into invoice_credit_notes(invoice_id, credit_date, amount, gst_amount, reason) values (?, ?, ?, ?, 'Mock: one resource billed for a week not worked')",
      args: [open[1].id, today, Math.round(Number(open[1].amount) * 0.1), Math.round(Number(open[1].gst_amount) * 0.1)],
    });
    console.log(`  credit note on invoice #${open[1].id}`);
  }
  const draft = (await client.execute("select id from invoices where status = 'not_raised' order by id limit 1")).rows[0];
  if (draft) {
    await client.execute({ sql: "update invoices set status = 'proforma', proforma_number = 'PF/MOCK/001' where id = ?", args: [draft.id] });
    console.log(`  proforma PF/MOCK/001 on invoice #${draft.id}`);
  }
}

main().then(() => client.close()).catch((e) => {
  console.error(e);
  process.exit(1);
});
