import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, projects, clients, agreements } from '@/lib/schema';
import { isInvoiceOverdue } from '@/lib/utils';

/** Every invoice, newest period first, with totals and the overdue flag. */
export async function loadInvoices() {
  const rows = await db
    .select({
      id: invoices.id,
      projectId: invoices.projectId,
      agreementId: invoices.agreementId,
      invoiceNumber: invoices.invoiceNumber,
      scope: invoices.scope,
      periodFrom: invoices.periodFrom,
      periodTo: invoices.periodTo,
      currency: invoices.currency,
      fxRateToInr: invoices.fxRateToInr,
      amount: invoices.amount,
      gstAmount: invoices.gstAmount,
      invoiceDate: invoices.invoiceDate,
      dueDate: invoices.dueDate,
      collectedDate: invoices.collectedDate,
      status: invoices.status,
      notes: invoices.notes,
      projectName: projects.projectName,
      clientName: clients.companyName,
      agreementTitle: agreements.title,
      agreementNumber: agreements.agreementNumber,
    })
    .from(invoices)
    .innerJoin(projects, eq(invoices.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(agreements, eq(invoices.agreementId, agreements.id))
    .orderBy(desc(invoices.periodFrom), desc(invoices.id))
    .all();

  return rows.map((r) => ({
    ...r,
    totalAmount: r.amount + r.gstAmount,
    overdue: isInvoiceOverdue(r.status, r.dueDate),
  }));
}

export type InvoiceRow = Awaited<ReturnType<typeof loadInvoices>>[number];
