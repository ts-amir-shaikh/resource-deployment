import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients, projects, resources } from '@/lib/schema';
import { requireCurrentAccount } from '@/lib/session';
import { loadDashboard, parseDashFilters } from '@/lib/timesheet-dashboard';
import { today } from '@/lib/utils';
import TimesheetDashboardClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Timesheet Dashboard · Resource Deployment' };

/**
 * FSD-18 v1.1 — utilisation, billing coverage, shadow work and billed time
 * with no client tasks. Admin only (D20); the rule is in lib/access.ts.
 */
export default async function TimesheetDashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireCurrentAccount();
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === 'string') p.set(k, v);

  // A bad period falls back to this month rather than showing an error page.
  const parsed = parseDashFilters(p, today());
  const filters = typeof parsed === 'string' ? (parseDashFilters(new URLSearchParams(), today()) as Exclude<typeof parsed, string>) : parsed;

  const [data, resourceOptions, clientOptions, projectOptions] = await Promise.all([
    loadDashboard(filters),
    db.select({ id: resources.id, name: resources.name }).from(resources).orderBy(asc(resources.name)).all(),
    db.select({ id: clients.id, name: clients.companyName }).from(clients).orderBy(asc(clients.companyName)).all(),
    db.select({ id: projects.id, name: projects.projectName }).from(projects).orderBy(asc(projects.projectName)).all(),
  ]);

  return (
    <TimesheetDashboardClient
      data={data}
      filters={filters}
      tab={p.get('tab') ?? 'overview'}
      invoiceId={Number(p.get('invoice')) || null}
      options={{ resources: resourceOptions, clients: clientOptions, projects: projectOptions }}
      periodError={typeof parsed === 'string' ? parsed : null}
    />
  );
}
