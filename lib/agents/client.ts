import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Model access for the agents.
 *
 * The API key is read from server env and never leaves it — the same rule the
 * Turso token follows. Nothing here is importable from a client component.
 */

export const MODELS = {
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5',
} as const;

export type ModelTier = keyof typeof MODELS;

/**
 * USD per million tokens, used to estimate what a run costs.
 *
 * Deliberately a constant in code rather than a live lookup: an estimate that
 * silently changes underneath recorded history would make past run costs
 * unreconcilable. Update it deliberately when pricing changes.
 */
const PRICING: Record<ModelTier, { input: number; output: number }> = {
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
};

export function estimateCost(
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[tier];
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

/** Rough token estimate for a pre-run cost preview. ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function isConfigured(): boolean {
  return Boolean((process.env.ANTHROPIC_API_KEY || '').trim());
}

function client(): Anthropic {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error(
      'Agents are not configured. Set ANTHROPIC_API_KEY in the deployment environment.',
    );
  }
  return new Anthropic({ apiKey });
}

/** Monthly ceiling in USD. 0 or unset means no cap. */
export function monthlyCapUsd(): number {
  const raw = (process.env.AGENT_MONTHLY_CAP_USD || '').trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type ResumeFile = {
  /** base64 of the original bytes — held in memory for the call only. */
  data: string;
  mediaType: string;
  name: string;
};

export type RunResult = {
  output: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/**
 * One agent invocation.
 *
 * A PDF is passed to the model as a document block rather than being flattened
 * to text first: resume layout carries meaning — columns, groupings, what sits
 * under which employer — and text extraction routinely destroys exactly the
 * structure the evaluation depends on.
 */
export async function runAgent(opts: {
  tier: ModelTier;
  system: string;
  prompt: string;
  files?: ResumeFile[];
  maxTokens?: number;
}): Promise<RunResult> {
  const model = MODELS[opts.tier];

  const content: Anthropic.ContentBlockParam[] = [];
  for (const f of opts.files ?? []) {
    if (f.mediaType === 'application/pdf') {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: f.data },
      });
    }
  }
  content.push({ type: 'text', text: opts.prompt });

  const message = await client().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    messages: [{ role: 'user', content }],
  });

  const output = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;

  return {
    output,
    model,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(opts.tier, inputTokens, outputTokens),
  };
}
