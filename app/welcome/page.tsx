import { requireCurrentAccount } from '@/lib/session';
import { ROLE_LABELS } from '@/lib/auth';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Welcome · Resource Deployment' };

/**
 * The holding page for roles whose screens are not built yet (PENDING_ROLES).
 * It is the only page those roles may open, so a person given one of them can
 * sign in, confirm their account works, and wait for their access — rather
 * than meeting a redirect loop or someone else's dashboard.
 */
export default async function WelcomePage() {
  const session = await requireCurrentAccount();

  return (
    <div className="pb-12">
      <PageHeader title={`Welcome, ${session.name.split(' ')[0]}`} />
      <div className="max-w-xl px-6 py-8 text-sm leading-6 text-ink2">
        <p>
          Your account is set up as <strong className="text-ink">{ROLE_LABELS[session.role]}</strong>.
          The screens for this role are still being built, so there is nothing else to open yet.
        </p>
        <p className="mt-3">
          You will not need to do anything when they arrive. Sign in the same way and your screens
          will be here.
        </p>
      </div>
    </div>
  );
}
