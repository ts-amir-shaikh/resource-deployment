import 'server-only';
import { invoices, projects } from '@/lib/schema';

/** The public invoice shape, built by allowlist. Money is { amount, currency }. */
export const invoiceShape = {
  id: invoices.id,
  invoiceNumber: invoices.invoiceNumber,
  clientId: projects.clientId,
  projectId: invoices.projectId,
  agreementId: invoices.agreementId,
  scope: invoices.scope,
  periodFrom: invoices.periodFrom,
  periodTo: invoices.periodTo,
  currency: invoices.currency,
  amount: invoices.amount,
  gstAmount: invoices.gstAmount,
  fxRateToInr: invoices.fxRateToInr,
  invoiceDate: invoices.invoiceDate,
  dueDate: invoices.dueDate,
  collectedDate: invoices.collectedDate,
  status: invoices.status,
  externalId: invoices.externalId,
  externalReference: invoices.externalReference,
};

type Row = {
  id: number;
  invoiceNumber: string | null;
  clientId: number;
  projectId: number;
  agreementId: number | null;
  scope: string;
  periodFrom: string;
  periodTo: string;
  currency: string;
  amount: number;
  gstAmount: number;
  fxRateToInr: number;
  invoiceDate: string | null;
  dueDate: string | null;
  collectedDate: string | null;
  status: string;
  externalId: string | null;
  externalReference: string | null;
};

export function toInvoice(r: Row, received: { amount: number; tds: number }) {
  const m = (amount: number) => ({ amount, currency: r.currency });
  const total = Math.round((r.amount + r.gstAmount) * 100) / 100;
  return {
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    clientId: r.clientId,
    projectId: r.projectId,
    agreementId: r.agreementId,
    scope: r.scope,
    periodFrom: r.periodFrom,
    periodTo: r.periodTo,
    amount: m(r.amount),
    gstAmount: m(r.gstAmount),
    total: m(total),
    fxRateToInr: r.fxRateToInr,
    invoiceDate: r.invoiceDate,
    dueDate: r.dueDate,
    collectedDate: r.collectedDate,
    status: r.status,
    received: m(received.amount),
    tdsDeducted: m(received.tds),
    externalId: r.externalId,
    externalReference: r.externalReference,
  };
}
