import 'server-only';
import { eq } from 'drizzle-orm';
import { prospects, clients } from './schema';
import type { Executor } from './db';

/**
 * Resolves what the requirement form sent — a client, an existing prospect,
 * or a freshly typed company — into the ids the row stores.
 *
 * A typed name that matches an unconverted prospect exactly reuses it rather
 * than minting a duplicate; a name nobody has seen becomes a new prospect
 * row, credited to whoever typed it. Either way `companyName` is set from the
 * record, so the label on the row cannot drift from the thing it points at.
 */
export async function resolveCompany(
  tx: Executor,
  input: { clientId?: number; prospectId?: number; companyName: string },
  createdByUserId: number | null,
): Promise<{ clientId: number | null; prospectId: number | null; companyName: string }> {
  if (input.clientId) {
    const c = await tx.select({ name: clients.companyName }).from(clients).where(eq(clients.id, input.clientId)).get();
    if (!c) throw new Error('Selected client no longer exists');
    return { clientId: input.clientId, prospectId: null, companyName: c.name };
  }
  if (input.prospectId) {
    const p = await tx
      .select({ name: prospects.companyName, converted: prospects.convertedClientId })
      .from(prospects)
      .where(eq(prospects.id, input.prospectId))
      .get();
    if (!p) throw new Error('Selected prospect no longer exists');
    // A prospect that has since become a client: the requirement belongs to
    // the client now, not to the prospect it used to be.
    if (p.converted) return { clientId: p.converted, prospectId: input.prospectId, companyName: p.name };
    return { clientId: null, prospectId: input.prospectId, companyName: p.name };
  }
  const name = input.companyName.trim();
  const existing = await tx
    .select({ id: prospects.id, converted: prospects.convertedClientId })
    .from(prospects)
    .where(eq(prospects.companyName, name))
    .get();
  if (existing) {
    return { clientId: existing.converted ?? null, prospectId: existing.id, companyName: name };
  }
  const created = await tx
    .insert(prospects)
    .values({ companyName: name, createdByUserId })
    .returning({ id: prospects.id })
    .get();
  return { clientId: null, prospectId: created.id, companyName: name };
}
