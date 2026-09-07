import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  invoices,
  invoiceResources,
  projects,
  clients,
  agreements,
} from '@/lib/schema';
import { invoiceSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody } from '@/lib/api';
import { isInvoiceOverdue, today } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const projectId = searchParams.get('project_id');
    const agreementId = searchParams.get('agreement_id');
    const overdue = searchParams.get('overdue') === 'true';
    const periodFrom = searchParams.get('period_from');
    const periodTo = searchParams.get('period_to');

    const filters = [];
    if (
      status === 'not_raised' ||
      status === 'raised' ||
      status === 'pending_collection' ||
      status === 'collected'
    ) {
      filters.push(eq(invoices.status, status));
    }
    if (projectId) filters.push(eq(invoices.projectId, Number(projectId)));
    if (agreementId) filters.push(eq(invoices.agreementId, Number(agreementId)));
    if (periodFrom) filters.push(gte(invoices.periodFrom, periodFrom));
    if (periodTo) filters.push(lte(invoices.periodTo, periodTo));
    if (overdue) {
      filters.push(
        sql`${invoices.status} in ('raised','pending_collection')
            and ${invoices.dueDate} is not null
            and ${invoices.dueDate} < ${today()}`,
      );
    }

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
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(invoices.periodFrom), desc(invoices.id))
      .all();

    return ok(
      rows.map((r) => ({
        ...r,
        totalAmount: r.amount + r.gstAmount,
        overdue: isInvoiceOverdue(r.status, r.dueDate),
      })),
    );
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, invoiceSchema);
    if (error) return error;

    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .get();
    if (!project) return fail('Selected project no longer exists', 422);

    if (data.agreementId) {
      const agreement = await db
        .select({ id: agreements.id, projectId: agreements.projectId, currency: agreements.currency })
        .from(agreements)
        .where(eq(agreements.id, data.agreementId))
        .get();
      if (!agreement) return fail('Selected agreement no longer exists', 422);
      if (agreement.projectId !== data.projectId) {
        return fail('That agreement belongs to a different project', 422, {
          fields: { agreementId: 'Pick an agreement from the selected project' },
        });
      }
      // An invoice is denominated in the currency of the PO it is raised
      // against. It keeps that currency afterwards even if the agreement is
      // later corrected — an invoice already sent does not change.
      if (agreement.currency !== data.currency) {
        return fail(
          `This agreement is in ${agreement.currency}; the invoice must be raised in the same currency.`,
          422,
          { fields: { currency: `Must be ${agreement.currency}` } },
        );
      }
    }

    const created = await db.transaction(async (tx) => {
      const row = await tx
        .insert(invoices)
        .values({
          projectId: data.projectId,
          agreementId: data.agreementId ?? null,
          invoiceNumber: data.invoiceNumber,
          scope: data.scope,
          periodFrom: data.periodFrom,
          periodTo: data.periodTo,
          currency: data.currency,
          fxRateToInr: data.fxRateToInr,
          amount: data.amount,
          gstAmount: data.gstAmount,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          status: 'not_raised',
          notes: data.notes,
        })
        .returning()
        .get();

      for (const rid of data.resourceIds) {
        await tx.insert(invoiceResources)
          .values({ invoiceId: row.id, resourceId: rid })
          .run();
      }
      return row;
    });

    return ok(created, 201);
  });
}
