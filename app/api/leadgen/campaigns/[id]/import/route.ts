import { parse } from 'csv-parse/sync';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { campaigns, campaignImports, clients, prospectContacts, prospects, users } from '@/lib/schema';
import { handle, ok, fail, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';
import {
  autoMapHeaders,
  parseRows,
  planImport,
  type ImportField,
  type ExistingContact,
} from '@/lib/leadgen-import';
import type { CompanyRecord } from '@/lib/leadgen-rules';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** 5 MB. The largest reference list is 36 KB; this is room, not a target. */
const MAX_BYTES = 5 * 1024 * 1024;

type Defaults = {
  source?: string | null;
  industry?: string | null;
  location?: string | null;
  ownerUserId?: number | null;
};

/**
 * M69 — load a campaign's contact list (D21–D24, D28, D29).
 *
 * One route rather than separate preview and commit paths, so the plan that
 * is written is produced by exactly the code that produced the plan shown —
 * the same reason the CLI importers take `--commit` rather than having a
 * second entry point. The browser keeps the file and posts it again to
 * commit; the plan is recomputed, so anything that changed in between is
 * seen rather than assumed.
 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid campaign id', 400);

    const session = await requireSession();
    const campaign = await db.select().from(campaigns).where(eq(campaigns.id, id)).get();
    if (!campaign) return fail('Campaign not found', 404);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail('Attach a CSV file', 422);
    if (file.size === 0) return fail('That file is empty', 422);
    if (file.size > MAX_BYTES) return fail('That file is larger than 5 MB', 413);

    const commit = form.get('commit') === 'true';
    const updateExisting = form.get('updateExisting') === 'true';
    const defaults: Defaults = JSON.parse(String(form.get('defaults') ?? '{}'));
    const sentMapping = form.get('mapping');

    let rows: string[][];
    try {
      rows = parse(await file.text(), {
        // Blank rows are kept here and dropped by parseRows, so a row's number
        // still matches the line the operator sees in their spreadsheet.
        skip_empty_lines: false,
        trim: true,
        bom: true,
        // The reference lists are ragged. A short row is a row with empty
        // cells, not a file to refuse.
        relax_column_count: true,
      }) as string[][];
    } catch (err) {
      return fail(`That file could not be read as CSV: ${err instanceof Error ? err.message : 'unknown error'}`, 422);
    }

    if (rows.length < 2) return fail('That file has a header row but no data rows', 422);

    const headers = rows[0].map((h) => (h ?? '').trim());
    const mapping: Record<number, ImportField> = sentMapping
      ? (JSON.parse(String(sentMapping)) as Record<number, ImportField>)
      : autoMapHeaders(headers);

    const parsed = parseRows(rows.slice(1), mapping);

    const [existingProspects, existingClients, contactRows] = await Promise.all([
      db.select({ id: prospects.id, name: prospects.companyName, campaignId: prospects.campaignId }).from(prospects).all(),
      db.select({ id: clients.id, name: clients.companyName }).from(clients).all(),
      db
        .select({ prospectId: prospectContacts.prospectId, name: prospectContacts.name, email: prospectContacts.email })
        .from(prospectContacts)
        .all(),
    ]);

    const plan = planImport(
      parsed,
      {
        prospects: existingProspects.map((p): CompanyRecord => ({ kind: 'prospect', id: p.id, name: p.name })),
        clients: existingClients.map((c): CompanyRecord => ({ kind: 'client', id: c.id, name: c.name })),
        contacts: contactRows as ExistingContact[],
      },
      { updateExisting },
    );

    if (!commit) {
      return ok({ headers, mapping, plan, committed: false });
    }

    // Owners named in the file ("Assigned to"), resolved by name. An
    // unmatched name falls back to the import's default rather than failing
    // the row — the column was empty in all 20 reference rows, and a typo in
    // it is not a reason to lose a contact.
    const staff = await db.select({ id: users.id, name: users.name }).from(users).all();
    const byName = new Map(staff.map((u) => [u.name.trim().toLowerCase(), u.id]));
    const resolveOwner = (named: string | null): number | null =>
      (named ? (byName.get(named.trim().toLowerCase()) ?? null) : null) ?? defaults.ownerUserId ?? null;

    const written = await db.transaction(async (tx) => {
      let prospectsCreated = 0;
      let contactsCreated = 0;

      for (const company of plan.companies) {
        if (company.action === 'error' || company.action === 'client') continue;

        let prospectId = company.prospectId;

        if (company.action === 'create') {
          const row = await tx
            .insert(prospects)
            .values({
              companyName: company.companyName,
              campaignId: id,
              stage: 'new',
              temperature: 'cold',
              // D28: the sheet's own value where it has one, the import's
              // default where it does not. No sheet carried an industry.
              industry: defaults.industry ?? null,
              location: company.location ?? defaults.location ?? null,
              source: (defaults.source as never) ?? 'campaign',
              notes: company.insight ?? null,
              ownerUserId: resolveOwner(company.owner),
              createdByUserId: session.uid || null,
            })
            .returning()
            .get();
          prospectId = row.id;
          prospectsCreated++;
        } else if (prospectId) {
          // An existing prospect joins this campaign only if it is in none.
          // A prospect already worked under another campaign is not taken
          // from it by somebody importing a list it happens to appear on.
          const current = existingProspects.find((p) => p.id === prospectId);
          if (current && current.campaignId === null) {
            await tx.update(prospects).set({ campaignId: id }).where(eq(prospects.id, prospectId)).run();
          }
        }

        if (!prospectId) continue;

        const existingHere = contactRows.filter((c) => c.prospectId === prospectId).length;
        let added = 0;
        for (const contact of company.contacts) {
          if (contact.action !== 'create') continue;
          await tx
            .insert(prospectContacts)
            .values({
              prospectId,
              name: contact.name,
              designation: contact.designation,
              email: contact.email,
              mobile: contact.mobile,
              linkedin: contact.linkedin,
              notes: contact.notes,
              // The first contact on a prospect that had none is its primary.
              isPrimary: existingHere === 0 && added === 0,
            })
            .run();
          added++;
          contactsCreated++;
        }
      }

      const log = await tx
        .insert(campaignImports)
        .values({
          campaignId: id,
          fileName: file.name || 'upload.csv',
          rowCount: plan.counts.rows,
          prospectsCreated,
          prospectsMatched: plan.counts.companiesMatched,
          contactsCreated,
          rowsSkipped: plan.counts.contactsSkipped,
          rowsFailed: plan.counts.rowsFailed,
          byUserId: session.uid || null,
        })
        .returning()
        .get();

      return { prospectsCreated, contactsCreated, importId: log.id };
    });

    return ok({ headers, mapping, plan, committed: true, ...written });
  });
}

/** D24: what has been loaded into this campaign, newest first. */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid campaign id', 400);
    await requireSession();

    const rows = await db
      .select({
        id: campaignImports.id,
        fileName: campaignImports.fileName,
        rowCount: campaignImports.rowCount,
        prospectsCreated: campaignImports.prospectsCreated,
        prospectsMatched: campaignImports.prospectsMatched,
        contactsCreated: campaignImports.contactsCreated,
        rowsSkipped: campaignImports.rowsSkipped,
        rowsFailed: campaignImports.rowsFailed,
        byName: users.name,
        createdAt: campaignImports.createdAt,
      })
      .from(campaignImports)
      .leftJoin(users, eq(campaignImports.byUserId, users.id))
      .where(eq(campaignImports.campaignId, id))
      .orderBy(sql`${campaignImports.id} desc`)
      .all();

    return ok(rows);
  });
}
