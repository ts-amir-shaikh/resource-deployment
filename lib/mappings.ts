import { today } from './utils';

/**
 * The timestamp columns a status change carries with it (M30-3, M30-5).
 *
 * One function, every write path: the mapping route, the interview sync, and
 * the referral accept all go through here, so "when did this last move" and
 * "when was the offer made" can never disagree with `status` because one
 * caller forgot. Returns only the columns to set — spread it into the update.
 */
export function statusStamps(
  previous: { status: string; offeredAt: string | null } | null,
  next: string,
): { statusChangedAt?: string; offeredAt?: string } {
  const out: { statusChangedAt?: string; offeredAt?: string } = {};
  const changed = previous === null || previous.status !== next;
  if (changed) out.statusChangedAt = today();
  // Stamped the first time only. Moving offered → joined → back to offered
  // (it happens) must not erase when the offer was actually made.
  if (next === 'offered' && !previous?.offeredAt) out.offeredAt = today();
  return out;
}
