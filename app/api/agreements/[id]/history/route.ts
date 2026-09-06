import { handle, ok, fail, parseId } from '@/lib/api';
import { getAgreementChain, getAgreementResources } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/** Full renewal chain, oldest version first, with a per-version diff. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid agreement id', 400);

    const chain = await getAgreementChain(id);
    if (!chain.length) return fail('Agreement not found', 404);

    const versions = await Promise.all(
      chain.map(async (a) => ({
        ...a,
        resources: await getAgreementResources(a.id),
      })),
    );

    // Diff each version against the one before it.
    const withDiffs = versions.map((v, i) => {
      if (i === 0) return { ...v, diff: null };
      const prev = versions[i - 1];
      const prevIds = new Set(prev.resources.map((r) => r.resourceId));
      const currIds = new Set(v.resources.map((r) => r.resourceId));

      return {
        ...v,
        diff: {
          valueDelta: v.value - prev.value,
          valuePctChange:
            prev.value > 0 ? ((v.value - prev.value) / prev.value) * 100 : null,
          added: v.resources.filter((r) => !prevIds.has(r.resourceId)),
          removed: prev.resources.filter((r) => !currIds.has(r.resourceId)),
          retained: v.resources.filter((r) => prevIds.has(r.resourceId)),
        },
      };
    });

    return ok(withDiffs);
  });
}
