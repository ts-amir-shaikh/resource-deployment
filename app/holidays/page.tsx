import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients, holidays } from '@/lib/schema';
import { requireCurrentAccount } from '@/lib/session';
import HolidaysClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Holidays · Resource Deployment' };

/** The holiday calendar that pre-fills timesheets (M65, G-RES-03). */
export default async function HolidaysPage() {
  const session = await requireCurrentAccount();
  const [rows, clientOptions] = await Promise.all([
    db
      .select({
        id: holidays.id,
        holidayDate: holidays.holidayDate,
        name: holidays.name,
        clientId: holidays.clientId,
        clientName: clients.companyName,
      })
      .from(holidays)
      .leftJoin(clients, eq(holidays.clientId, clients.id))
      .orderBy(asc(holidays.holidayDate))
      .all(),
    db.select({ id: clients.id, companyName: clients.companyName }).from(clients).orderBy(clients.companyName).all(),
  ]);

  return <HolidaysClient initial={rows} clients={clientOptions} canEdit={session.role === 'admin'} />;
}
