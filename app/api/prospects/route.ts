import { desc, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { prospects } from '@/lib/schema';
import { handle, ok, parseBody } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { guardCompanyDuplicates } from '@/lib/leadgen';
import { leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

const optionalStr = z.string().trim().optional().transform((v) => (v === '' ? undefined : v));

const prospectSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  contactName: optionalStr,
  contactEmail: optionalStr,
  contactMobile: optionalStr,
  notes: optionalStr,
  confirmDuplicate: z.coerce.boolean().default(false),
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
    const { confirmDuplicate, ...fields } = data;
    return leadgen(async () => {
      // M66: the same duplicate warning and owner rule as /api/leadgen/prospects.
      // The single contact still lands in the old columns here; the M66
      // screens use prospect_contacts.
      await guardCompanyDuplicates(fields.companyName, confirmDuplicate);
      const row = await db
        .insert(prospects)
        .values({
          ...fields,
          createdByUserId: viewer.uid || null,
          ownerUserId: viewer.role === 'leadgen' ? viewer.uid || null : null,
        })
        .returning()
        .get();
      return ok(row, 201);
    });
  });
}
