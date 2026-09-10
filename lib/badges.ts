import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema';
import { getApplicantAlert, type ApplicantAlert } from './queries';
import type { Session } from './auth';

/**
 * The applicant count for the sidebar.
 *
 * Runs in the root layout, so it is on the path of every page render — kept to
 * two small indexed queries for that reason, and returning null rather than
 * throwing if anything is off. A badge is not worth taking the whole
 * application down for.
 */
export async function applicantBadge(session: Session): Promise<ApplicantAlert | null> {
  try {
    const me = session.uid
      ? await db
          .select({ isTeamLead: users.isTeamLead, seenAt: users.applicationsSeenAt })
          .from(users)
          .where(eq(users.id, session.uid))
          .get()
      : undefined;

    // A recruiter is counted only on requirements they own. A lead's scope is
    // the team, and back-office roles see everything — so neither is filtered.
    const scope = session.role === 'ta' && !me?.isTeamLead ? session.uid || -1 : undefined;
    return await getApplicantAlert(scope, me?.seenAt ?? null);
  } catch {
    return null;
  }
}
