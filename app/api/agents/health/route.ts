import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isConfigured } from '@/lib/agents/client';
import { systemPrompt, TASK_PROMPTS, AGENT_META } from '@/lib/agents/prompts';
import { estimateCost, estimateTokens, MODELS } from '@/lib/agents/client';
import { prepareFile, previewCost } from '@/lib/agents/run';

export const dynamic = 'force-dynamic';

/**
 * Health check for the agent layer.
 *
 * Exists because the instructions arrived corrupted mid-sentence, on the
 * anti-hallucination rules specifically. That damage was invisible until
 * someone read the file closely — nothing would have failed, the agents would
 * simply have been told something slightly wrong. This asserts the prompts
 * still assemble, still carry the integrity rules, and are still free of the
 * corruption markers, so a bad edit to /docs surfaces here rather than in an
 * evaluation about a real candidate.
 *
 * Admin only: it reports configuration, not business data.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const r: [string, boolean, string][] = [];
  const ck = (n: string, c: boolean, x = '') => r.push([n, c, x]);

  for (const kind of Object.keys(AGENT_META) as (keyof typeof AGENT_META)[]) {
    const sys = systemPrompt(kind);
    ck(`${kind}: system prompt built`, sys.length > 5000, `${sys.length} chars`);
    ck(`${kind}: integrity rule intact`,
      sys.includes('Do not add responsibilities or achievements that are not supported by'));
    ck(`${kind}: no corruption`, !/_STA|\.jpg|Bots are not|элийн|üss/.test(sys));
    ck(`${kind}: task prompt`, TASK_PROMPTS[kind].length > 50);
  }
  ck('validation gets the playbook',
    systemPrompt('resume_validation').includes('Requirement Fulfilment Playbook'));
  ck('jd evaluator does not',
    !systemPrompt('jd_evaluator').includes('Requirement Fulfilment Playbook'));

  ck('validation → Opus', AGENT_META.resume_validation.model === 'opus');
  ck('budgeting → Opus', AGENT_META.budgeting.model === 'opus');
  ck('jd evaluator → Sonnet', AGENT_META.jd_evaluator.model === 'sonnet');
  ck('formatting → Sonnet', AGENT_META.resume_formatting.model === 'sonnet');
  ck('model ids', MODELS.opus === 'claude-opus-5' && MODELS.sonnet === 'claude-sonnet-5');

  const c = estimateCost('opus', 1_000_000, 1_000_000);
  ck('opus 1M+1M = $90', Math.abs(c - 90) < 0.001, `$${c}`);
  const s = estimateCost('sonnet', 20_000, 3_000);
  ck('sonnet typical run', s > 0.05 && s < 0.25, `$${s.toFixed(4)}`);
  ck('token estimate', estimateTokens('x'.repeat(4000)) === 1000);
  const pv = previewCost('resume_validation', 6000);
  ck('validation preview cost sane', pv > 0.1 && pv < 2, `$${pv.toFixed(3)}`);

  // File handling
  const pdf = new File([Buffer.from('%PDF-1.4 fake')], 'cv.pdf', { type: 'application/pdf' });
  const pdfOut = await prepareFile(pdf);
  ck('PDF → document block, not text',
    Boolean(pdfOut.doc) && !pdfOut.text && pdfOut.doc!.mediaType === 'application/pdf');
  const txt = new File([Buffer.from('Ravi Kumar\n8 years Java')], 'cv.txt', { type: 'text/plain' });
  const txtOut = await prepareFile(txt);
  ck('TXT → text', Boolean(txtOut.text) && txtOut.text!.includes('Ravi Kumar') && !txtOut.doc);

  const failed = r.filter(([, c]) => !c);
  return NextResponse.json({
    apiKeyConfigured: isConfigured(),
    healthy: failed.length === 0,
    passed: r.length - failed.length,
    failed: failed.length,
    results: r.map(([n, c, x]) => `${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`),
  });
}
