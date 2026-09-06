import { handle, ok } from '@/lib/api';
import { getBillingByClient, getSkillDistribution } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () =>
    ok({ billingByClient: await getBillingByClient(), skills: await getSkillDistribution() }),
  );
}
