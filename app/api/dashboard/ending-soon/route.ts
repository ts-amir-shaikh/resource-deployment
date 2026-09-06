import { handle, ok } from '@/lib/api';
import { getEndingSoon, getExpiringAgreements } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const days = Number(searchParams.get('days') ?? 30);
    const window = Number.isFinite(days) && days > 0 ? days : 30;
    return ok({
      deployments: await getEndingSoon(window),
      agreements: await getExpiringAgreements(window),
    });
  });
}
