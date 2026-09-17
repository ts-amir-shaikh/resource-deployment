import { desc, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { prospects } from '@/lib/schema';
import { handle, ok, parseBody } from '@/lib/api';
import { getViewer } from '@/lib/session';

export const dynamic = 'force-dynamic';

const optionalStr = z.string().trim().optional().transform((v) => (v === '' ? undefined : v));

const prospectSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  contactName: optionalStr,
  contactEmail: optionalStr,
  contactMobile: optionalStr,
  notes: optionalStr,
});

/** Unconverted prospects, newest first — what the company picker offers. */
export async function GET() {
  return handle(async () => {
    await getViewer();
    return ok(
      await db
        .select({ id: prospects.id, companyName: prospects.companyName, contactName: prospects.contactName })
        .from(prospects)
        .where(isNull(prospects.convertedClientId))
        .orderBy(desc(prospects.id))
        .all(),
    );
  });
}

/** A new company we are talking to. Leadgen's first act on a lead. */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    const { data, error } = await parseBody(req, prospectSchema);
    if (error) return error;
    const row = await db
      .insert(prospects)
      .values({ ...data, createdByUserId: viewer.uid || null })
      .returning()
      .get();
    return ok(row, 201);
  });
}
