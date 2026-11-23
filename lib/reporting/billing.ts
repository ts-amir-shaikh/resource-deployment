import { and, eq, sql } from 'drizzle-orm';
import { clients, deployments, projects } from '@/lib/schema';
import { billingParams } from './params';
import { paginate } from './paginate';
import { addTo, isCurrency, toMoney, type Currency } from './money';
import type { EndpointSpec } from './handler';
import type { BillingReport } from './types';

/**
 * GET /api/reporting/v1/billing — contracted monthly billing.
 *
 * What active BILLABLE deployments are set to bill each month, per client and
 * currency, ex-GST. This is the contract, not revenue: nothing here says an
 * invoice was raised or paid (see /invoices).
 *
 * Reconciles with getBillingByClient() in lib/queries.ts (the dashboard's
 * "billing by client"); tests/reporting-parity.test.ts holds the two together.
 * That function is the specification, not a dependency: it uses the global,
 * writable database client, so reporting owns an equivalent read-only query.
 *
 * D6 (verification pending): billing_amount is summed as entered, exactly as
 * the dashboard does. It is NOT multiplied or divided by allocation_percentage.
 *
 * Not selected, by design: per-deployment or per-resource rows, resource
 * names, commission, overhead, GST, notes.
 */

export const billingEndpoint: EndpointSpec<typeof billingParams, BillingReport> = {
  scope: 'billing',
  schema: billingParams,
  async run(p, { db }) {
    const filters = [eq(deployments.status, 'active'), eq(deployments.deploymentType, 'billable')];
    if (p.currency) filters.push(eq(deployments.currency, p.currency));
    if (p.client_id) filters.push(eq(projects.clientId, p.client_id));
    const where = and(...filters);

    // Money grouped by client AND currency. Headcount below is deliberately a
    // separate query: counting distinct resources per currency group and then
    // combining is wrong either way (double counts someone billed in two
    // currencies, or drops the smaller group).
    const money = await db
      .select({
        clientId: clients.id,
        clientName: clients.companyName,
        currency: deployments.currency,
        amount: sql<number>`coalesce(sum(${deployments.billingAmount}), 0)`,
        deployments: sql<number>`count(*)`,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(where)
      .groupBy(clients.id, deployments.currency)
      .all();

    const counts = await db
      .select({
        clientId: clients.id,
        projects: sql<number>`count(distinct ${projects.id})`,
        resources: sql<number>`count(distinct ${deployments.resourceId})`,
        deployments: sql<number>`count(*)`,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(where)
      .groupBy(clients.id)
      .all();

    const totalsRow = await db
      .select({
        deployments: sql<number>`count(*)`,
        resources: sql<number>`count(distinct ${deployments.resourceId})`,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .where(where)
      .get();

    const totalByCurrency = new Map<Currency, number>();
    const perClient = new Map<number, { name: string; money: Map<Currency, number> }>();
    for (const r of money) {
      if (!isCurrency(r.currency)) continue;
      addTo(totalByCurrency, r.currency, r.amount);
      const entry = perClient.get(r.clientId) ?? { name: r.clientName, money: new Map<Currency, number>() };
      addTo(entry.money, r.currency, r.amount);
      perClient.set(r.clientId, entry);
    }

    const clientRows = [...perClient.entries()]
      .map(([clientId, c]) => {
        const n = counts.find((x) => x.clientId === clientId);
        return {
          clientId,
          clientName: c.name,
          contractedMonthly: toMoney(c.money),
          activeBillableDeployments: n?.deployments ?? 0,
          projects: n?.projects ?? 0,
          billedResources: n?.resources ?? 0,
        };
      })
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.clientId - b.clientId);

    const { page, pagination } = paginate(clientRows, p.limit, p.offset);
    return {
      data: {
        totals: {
          contractedMonthly: toMoney(totalByCurrency),
          activeBillableDeployments: totalsRow?.deployments ?? 0,
          // A distinct count over everyone billed, not the sum of the per-client counts.
          billedResources: totalsRow?.resources ?? 0,
        },
        clients: page,
      },
      notes: [
        'Contracted monthly billing from active billable deployments, ex-GST. It is not invoiced revenue.',
        'Each deployment billing amount is summed as entered; it is not adjusted by allocation percentage. This assumption is awaiting confirmation with Accounts.',
        'Amounts are per currency and are never converted. billedResources counts each person once across all clients.',
      ],
      pagination,
      rowCount: page.length,
    };
  },
};
