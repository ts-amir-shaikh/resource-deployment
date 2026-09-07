import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import mammoth from 'mammoth';
import { db } from '@/lib/db';
import { agentRuns } from '@/lib/schema';
import { systemPrompt, TASK_PROMPTS, AGENT_META, type AgentKind } from './prompts';
import { runAgent, monthlyCapUsd, estimateTokens, estimateCost, type ResumeFile } from './client';

/** USD spent so far this calendar month, across every agent and user. */
export async function monthToDateSpend(): Promise<number> {
  const month = new Date().toISOString().slice(0, 7);
  const row = await db
    .select({ total: sql<number>`coalesce(sum(${agentRuns.costUsd}), 0)` })
    .from(agentRuns)
    .where(sql`substr(${agentRuns.createdAt}, 1, 7) = ${month}`)
    .get();
  return row?.total ?? 0;
}

export type CapState = { cap: number; spent: number; blocked: boolean };

export async function capState(): Promise<CapState> {
  const cap = monthlyCapUsd();
  const spent = await monthToDateSpend();
  return { cap, spent, blocked: cap > 0 && spent >= cap };
}

/**
 * Turns an uploaded file into something the model can read.
 *
 * PDFs are passed through untouched so the model sees the real layout. DOCX has
 * no such path, so its text is extracted here — losing some structure, which is
 * a reason to prefer PDF and worth saying in the UI rather than hiding.
 */
export async function prepareFile(
  file: File,
): Promise<{ doc?: ResumeFile; text?: string }> {
  const buf = Buffer.from(await file.arrayBuffer());

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return {
      doc: { data: buf.toString('base64'), mediaType: 'application/pdf', name: file.name },
    };
  }

  if (file.name.toLowerCase().endsWith('.docx')) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: `--- ${file.name} ---\n${value.trim()}` };
  }

  // .txt / .md and anything else legible as text.
  return { text: `--- ${file.name} ---\n${buf.toString('utf8').trim()}` };
}

export type AgentInputs = {
  jd?: string;
  resumeText?: string;
  referenceTemplate?: string;
  roleDetails?: string;
  notes?: string;
};

/** Assembles the user turn from whatever the agent's form supplied. */
function buildPrompt(agent: AgentKind, inputs: AgentInputs): string {
  const parts = [TASK_PROMPTS[agent]];
  const section = (title: string, body?: string) => {
    if (body && body.trim()) parts.push(`\n\n## ${title}\n\n${body.trim()}`);
  };

  section('Job Description', inputs.jd);
  section('Role and commercial details', inputs.roleDetails);
  section('Candidate Resume', inputs.resumeText);
  section('Reference template (structure only — never copy its content)', inputs.referenceTemplate);
  section('Additional instructions from the user', inputs.notes);

  return parts.join('');
}

export type StartRunOpts = {
  agent: AgentKind;
  title: string;
  inputs: AgentInputs;
  files?: ResumeFile[];
  user: { id: number; name: string };
  opportunityId?: number | null;
  candidateId?: number | null;
};

/**
 * Runs an agent and records the result.
 *
 * Note what is persisted: the assembled text inputs and the answer — never the
 * uploaded file. A resume is a third party's personal data, and keeping every
 * CV ever dragged onto this screen would build an archive nobody agreed to.
 * The bytes live in memory for the duration of the call and are then gone.
 */
export async function startRun(opts: StartRunOpts) {
  const { agent, user } = opts;
  const meta = AGENT_META[agent];

  const cap = await capState();
  if (cap.blocked) {
    throw new Error(
      `The monthly agent spend cap of $${cap.cap.toFixed(2)} has been reached ` +
        `($${cap.spent.toFixed(2)} used). Runs are paused until next month or until the cap is raised.`,
    );
  }

  const system = systemPrompt(agent);
  const prompt = buildPrompt(agent, opts.inputs);

  const run = await db
    .insert(agentRuns)
    .values({
      agent,
      status: 'running',
      userId: user.id,
      userName: user.name,
      title: opts.title,
      inputs: JSON.stringify(opts.inputs),
      opportunityId: opts.opportunityId ?? null,
      candidateId: opts.candidateId ?? null,
      model: meta.model,
    })
    .returning()
    .get();

  try {
    const result = await runAgent({
      tier: meta.model,
      system,
      prompt,
      files: opts.files,
    });

    await db
      .update(agentRuns)
      .set({
        status: 'complete',
        output: result.output,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      })
      .where(eq(agentRuns.id, run.id));

    return { id: run.id, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The agent failed to run';
    await db
      .update(agentRuns)
      .set({ status: 'failed', error: message })
      .where(eq(agentRuns.id, run.id));
    throw err;
  }
}

/** Pre-run estimate, so nobody is surprised by what a run costs. */
export function previewCost(agent: AgentKind, promptChars: number): number {
  const meta = AGENT_META[agent];
  // The system prompt is ~8k tokens of instructions on every call.
  const input = 8_000 + estimateTokens('x'.repeat(promptChars));
  return estimateCost(meta.model, input, 3_000);
}
