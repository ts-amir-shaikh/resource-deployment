import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resources } from '@/lib/schema';
import { requireCurrentAccount } from '@/lib/session';
import { listPeople } from '@/lib/accounts/people';
import { isMailConfigured } from '@/lib/mail';
import PeopleClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'People · Resource Deployment' };

export default async function PeoplePage() {
  const session = await requireCurrentAccount();
  const [people, resourceOptions] = await Promise.all([
    listPeople(),
    db
      .select({ id: resources.id, name: resources.name, email: resources.email })
      .from(resources)
      .orderBy(asc(resources.name))
      .all(),
  ]);

  return (
    <PeopleClient
      initial={people}
      resources={resourceOptions}
      canEdit={session.role === 'admin'}
      viewerId={session.uid}
      mailReady={isMailConfigured()}
    />
  );
}
