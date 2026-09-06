import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, projects, clients, agreements, resources } from '@/lib/schema';
import { isInvoiceOverdue } from '@/lib/utils';
import InvoicesClient from './client';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const rows = await db
    .select({
      id: invoices.id,
      projectId: invoices.projectId,
      agreementId: invoices.agreementId,
      invoiceNumber: invoices.invoiceNumber,
      scope: invoices.scope,
      periodFrom: invoices.periodFrom,
      periodTo: invoices.periodTo,
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

  const initial = rows.map((r) => ({
    ...r,
    totalAmount: r.amount + r.gstAmount,
    overdue: isInvoiceOverdue(r.status, r.dueDate),
  }));

  const projectOptions = await db
    .select({
      id: projects.id,
      projectName: projects.projectName,
      clientName: clients.companyName,
    })
    .from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .orderBy(clients.companyName, projects.projectName)
    .all();

  const agreementOptions = await db
    .select({
      id: agreements.id,
      projectId: agreements.projectId,
      title: agreements.title,
      agreementNumber: agreements.agreementNumber,
      renewalVersion: agreements.renewalVersion,
    })
    .from(agreements)
    .orderBy(agreements.title)
    .all();

  const resourceOptions = await db
    .select({ id: resources.id, name: resources.name })
    .from(resources)
    .orderBy(resources.name)
    .all();

  return (
    <InvoicesClient
      initial={initial}
      projects={projectOptions}
      agreements={agreementOptions}
      resources={resourceOptions}
    />
  );
}
