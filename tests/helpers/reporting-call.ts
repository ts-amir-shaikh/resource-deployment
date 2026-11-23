import { GET as billingGET } from '@/app/api/reporting/v1/billing/route';
import { GET as invoicesGET } from '@/app/api/reporting/v1/invoices/route';
import { GET as capacityGET } from '@/app/api/reporting/v1/capacity/route';
import { GET as pipelineGET } from '@/app/api/reporting/v1/pipeline/route';
import { GET as renewalsGET } from '@/app/api/reporting/v1/renewals/route';
import type { ReportingScope } from '@/lib/reporting/paths';
import { tokenEnv } from './reporting';

export type Json = Record<string, any>;

export const ALL_SCOPES: ReportingScope[] = ['billing', 'invoices', 'capacity', 'pipeline', 'renewals'];

const handlers: Record<ReportingScope, (req: Request) => Promise<Response>> = {
  billing: billingGET,
  invoices: invoicesGET,
  capacity: capacityGET,
  pipeline: pipelineGET,
  renewals: renewalsGET,
};

let seq = 0;

/** Calls a reporting route handler with a fresh token id (so the per-instance throttle never interferes). */
export async function callReporting(scope: ReportingScope, qs = ''): Promise<{ status: number; body: Json }> {
  seq++;
  const t = await tokenEnv({ id: `call-${seq}`, seed: String.fromCharCode(97 + (seq % 26)) });
  process.env.REPORTING_TOKENS = t.raw;
  const res = await handlers[scope](
    new Request(`http://localhost/api/reporting/v1/${scope}${qs}`, { headers: { authorization: `Bearer ${t.token}` } }),
  );
  return { status: res.status, body: await res.json() };
}

export const moneyMap = (arr: { currency: string; amount: number }[]) =>
  Object.fromEntries(arr.map((m) => [m.currency, m.amount]));
