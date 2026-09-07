import { Suspense } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import LoginClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in · Resource Deployment' };

export default async function LoginPage() {
  // Until the first account exists the app still accepts the old shared
  // password, and asking for a username there would just be confusing.
  let hasAccounts = false;
  try {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.active, true));
    hasAccounts = rows.length > 0;
  } catch {
    // A database that hasn't been migrated yet has no users table. Falling
    // back to the shared-password form keeps sign-in working rather than
    // turning a pending migration into a locked door.
    hasAccounts = false;
  }

  return (
    <Suspense>
      <LoginClient hasAccounts={hasAccounts} />
    </Suspense>
  );
}
