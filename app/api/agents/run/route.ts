import { db } from '@/lib/db';
import { opportunities } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { handle, ok, fail } from '@/lib/api';
import { getSession } from '@/lib/session';
import { startRun, prepareFile, capState, type AgentInputs } from '@/lib/agents/run';
import { AGENT_META, type AgentKind } from '@/lib/agents/prompts';
import { isConfigured, type ResumeFile } from '@/lib/agents/client';

export const dynamic = 'force-dynamic';
// Model calls on a large resume routinely run past the default budget.
export const maxDuration = 300;

const AGENTS = Object.keys(AGENT_META) as AgentKind[];

export async function POST(req: Request) {
  return handle(async () => {
    const session = await getSession();
    if (!session) return fail('Not signed in', 401);
    // Management is view-only everywhere; here that also means it cannot
    // trigger a paid call. Middleware already blocks this, belt and braces.
    if (session.role === 'management') {
      return fail('Management access is view-only.', 403);
    }
    if (!isConfigured()) {
      return fail(
        'Agents are not configured yet. An ANTHROPIC_API_KEY must be set in the deployment environment.',
        503,
      );
    }

    const form = await req.formData();
    const agent = String(form.get('agent') ?? '') as AgentKind;
    if (!AGENTS.includes(agent)) return fail('Unknown agent', 400);

    const cap = await capState();
    if (cap.blocked) {
      return fail(
        `The monthly agent spend cap of $${cap.cap.toFixed(2)} has been reached. Runs are paused.`,
        429,
        { cap: cap.cap, spent: cap.spent },
      );
    }

    const inputs: AgentInputs = {
      jd: String(form.get('jd') ?? '') || undefined,
      roleDetails: String(form.get('roleDetails') ?? '') || undefined,
      referenceTemplate: String(form.get('referenceTemplate') ?? '') || undefined,
      notes: String(form.get('notes') ?? '') || undefined,
    };

    const rawOpportunity = String(form.get('opportunityId') ?? '');
    const opportunityId = /^\d+$/.test(rawOpportunity) ? Number(rawOpportunity) : null;

    // Pulling the JD from a requirement already in the pipeline, rather than
    // making someone paste what the system already holds.
    if (opportunityId && !inputs.jd) {
      const opp = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, opportunityId))
        .get();
      if (opp) {
        inputs.jd = [
          `Title: ${opp.title}`,
          `Company: ${opp.companyName}`,
          opp.experienceMin || opp.experienceMax
            ? `Experience: ${opp.experienceMin ?? '?'}–${opp.experienceMax ?? '?'} years`
            : '',
          opp.primarySkill ? `Primary skill: ${opp.primarySkill}` : '',
          opp.secondarySkill ? `Secondary skill: ${opp.secondarySkill}` : '',
          opp.workMode ? `Work mode: ${opp.workMode}` : '',
          opp.location ? `Location: ${opp.location}` : '',
          opp.engagementType ? `Engagement: ${opp.engagementType}` : '',
          `Positions: ${opp.requiredCount}`,
          opp.workingDays ? `Working days: ${opp.workingDays}` : '',
          opp.workingHours ? `Working hours: ${opp.workingHours}` : '',
          '',
          opp.jdContent ?? '',
        ]
          .filter(Boolean)
          .join('\n');
      }
    }

    // Files: PDFs go to the model intact, everything else becomes text.
    const files: ResumeFile[] = [];
    const textParts: string[] = [];
    for (const entry of form.getAll('files')) {
      if (!(entry instanceof File) || entry.size === 0) continue;
      if (entry.size > 10 * 1024 * 1024) {
        return fail(`${entry.name} is larger than 10MB.`, 413);
      }
      const prepared = await prepareFile(entry);
      if (prepared.doc) files.push(prepared.doc);
      if (prepared.text) textParts.push(prepared.text);
    }
    const pastedResume = String(form.get('resumeText') ?? '');
    if (pastedResume.trim()) textParts.push(pastedResume);
    if (textParts.length) inputs.resumeText = textParts.join('\n\n');

    if (AGENT_META[agent].needsResume && files.length === 0 && !inputs.resumeText) {
      return fail('Attach a resume, or paste its text.', 422, {
        fields: { files: 'A resume is required for this agent' },
      });
    }
    if (!inputs.jd && !inputs.roleDetails && !inputs.resumeText && files.length === 0) {
      return fail('Nothing to work with — provide a JD, role details or a resume.', 422);
    }

    const title =
      String(form.get('title') ?? '').trim() ||
      `${AGENT_META[agent].label} · ${new Date().toISOString().slice(0, 10)}`;

    const result = await startRun({
      agent,
      title,
      inputs,
      files,
      user: { id: session.uid, name: session.name },
      opportunityId,
    });

    return ok(result, 201);
  });
}
