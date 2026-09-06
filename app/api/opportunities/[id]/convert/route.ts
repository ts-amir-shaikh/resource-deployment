import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  opportunities,
  opportunityCandidates,
  candidates,
  clients,
  projects,
  resources,
  deployments,
} from '@/lib/schema';
import { convertSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getResourceAllocation } from '@/lib/queries';
import { today } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Turns a won opportunity into delivery-side records.
 *
 *   prospect  -> creates the Client row and back-links every opportunity
 *                sharing that company name
 *   always    -> creates the Project
 *   optional  -> for each candidate marked 'joined', ensures a Resource exists
 *                and opens a billable Deployment
 *
 * Deployments are only opened where the resource has allocation headroom;
 * anything skipped is reported rather than silently dropped, so the caller
 * can place those by hand.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const opp = await db.select().from(opportunities).where(eq(opportunities.id, id)).get();
    if (!opp) return fail('Opportunity not found', 404);

    if (opp.stage !== 'won') {
      return fail('Only a won opportunity can be converted into a project.', 409);
    }
    if (opp.convertedProjectId) {
      return fail('This opportunity has already been converted.', 409, {
        projectId: opp.convertedProjectId,
      });
    }

    const { data, error } = await parseBody(req, convertSchema);
    if (error) return error;

    const joined = await db
      .select({
        mappingId: opportunityCandidates.id,
        candidateId: candidates.id,
        name: candidates.name,
        email: candidates.email,
        mobile: candidates.mobile,
        designation: candidates.currentDesignation,
        primarySkill: candidates.primarySkill,
        secondarySkill: candidates.secondarySkill,
        otherSkills: candidates.otherSkills,
        expectedCtc: candidates.expectedCtc,
        resourceId: candidates.resourceId,
        expectedBilling: opportunityCandidates.expectedBilling,
      })
      .from(opportunityCandidates)
      .innerJoin(candidates, eq(opportunityCandidates.candidateId, candidates.id))
      .where(
        and(
          eq(opportunityCandidates.opportunityId, id),
          eq(opportunityCandidates.status, 'joined'),
        ),
      )
      .all();

    const skipped: { name: string; reason: string }[] = [];
    const createdDeployments: number[] = [];
    const createdResources: number[] = [];

    const result = await db.transaction(async (tx) => {
      // 1. Prospect becomes a real client.
      let clientId = opp.clientId;
      let createdClientId: number | null = null;

      if (!clientId) {
        const client = await tx
          .insert(clients)
          .values({ companyName: opp.companyName })
          .returning()
          .get();
        clientId = client.id;
        createdClientId = client.id;

        // Any other opportunity for the same prospect now points at the client.
        await tx.update(opportunities)
          .set({ clientId: client.id })
          .where(
            and(
              eq(opportunities.companyName, opp.companyName),
              isNull(opportunities.clientId),
            ),
          )
          .run();
      }

      // 2. The project.
      const project = await tx
        .insert(projects)
        .values({
          clientId: clientId!,
          projectName: data.projectName,
          managerName: data.managerName,
          managerEmail: data.managerEmail,
          managerMobile: data.managerMobile,
          managerDesignation: data.managerDesignation,
        })
        .returning()
        .get();

      // 3. Resources + deployments for joined candidates.
      if (data.createDeployments) {
        for (const c of joined) {
          let resourceId = c.resourceId;

          if (!resourceId) {
            // External hire: create the bench resource now.
            const email =
              c.email ??
              `${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@placeholder.local`;

            const existingByEmail = await tx
              .select({ id: resources.id })
              .from(resources)
              .where(eq(resources.email, email))
              .get();

            if (existingByEmail) {
              resourceId = existingByEmail.id;
            } else {
              const r = await tx
                .insert(resources)
                .values({
                  name: c.name,
                  email,
                  mobile: c.mobile,
                  designation: c.designation,
                  currentCtc: c.expectedCtc,
                  primarySkill: c.primarySkill,
                  secondarySkill: c.secondarySkill,
                  otherSkills: c.otherSkills,
                })
                .returning()
                .get();
              resourceId = r.id;
              createdResources.push(r.id);
            }

            await tx.update(candidates)
              .set({ resourceId })
              .where(eq(candidates.id, c.candidateId))
              .run();
          }

          // Respect the same 100% cap the deployments module enforces.
          // Read through `tx`: deployments inserted earlier in this same loop
          // are not yet committed, and a plain `db` read would miss them —
          // letting two joined candidates both claim the same resource.
          const alloc = await getResourceAllocation(resourceId, undefined, tx);
          if (alloc.free < 100) {
            skipped.push({
              name: c.name,
              reason:
                alloc.free === 0
                  ? 'Already fully allocated'
                  : `Only ${alloc.free}% allocation free`,
            });
            continue;
          }

          const d = await tx
            .insert(deployments)
            .values({
              resourceId,
              projectId: project.id,
              deploymentType: 'billable',
              allocationPercentage: 100,
              startDate: today(),
              billingAmount: c.expectedBilling ?? 0,
              commissionAmount: 0,
              gstApplicable: true,
              status: 'active',
            })
            .returning()
            .get();
          createdDeployments.push(d.id);
        }
      }

      await tx.update(opportunities)
        .set({ convertedProjectId: project.id, clientId })
        .where(eq(opportunities.id, id))
        .run();

      return { project, clientId, createdClientId };
    });

    return ok(
      {
        projectId: result.project.id,
        projectName: result.project.projectName,
        clientId: result.clientId,
        createdClient: result.createdClientId !== null,
        createdResources,
        createdDeployments,
        skipped,
        joinedCandidates: joined.length,
      },
      201,
    );
  });
}
