import fs from 'node:fs';
import path from 'node:path';

/**
 * Agent instructions, loaded from the markdown in /docs.
 *
 * The documents are the source of truth and stay in version control, so a
 * change to how an agent behaves is a reviewable diff rather than something
 * edited in a chat window and forgotten. They are read once at module load;
 * changing them requires a deploy, which is the intent — these are the rules
 * the business runs on, not a runtime setting.
 */

const DOCS = path.join(process.cwd(), 'docs');

function loadDoc(file: string): string {
  try {
    return fs.readFileSync(path.join(DOCS, file), 'utf8');
  } catch {
    // A missing document must not silently degrade an agent into improvising:
    // the instructions ARE the safeguards against inventing candidate facts.
    throw new Error(
      `Agent instructions missing: docs/${file}. The agents cannot run without them.`,
    );
  }
}

export const ROLE_INSTRUCTIONS = () => loadDoc('HR Business Executive instructions.md');
export const FULFILMENT_PLAYBOOK = () => loadDoc('evaluation process rule book.md');

export type AgentKind =
  | 'jd_evaluator'
  | 'budgeting'
  | 'resume_validation'
  | 'resume_formatting';

export const AGENT_META: Record<
  AgentKind,
  { label: string; blurb: string; model: 'sonnet' | 'opus'; needsResume: boolean }
> = {
  jd_evaluator: {
    label: 'JD Evaluator',
    blurb:
      'Structures a job description, separates mandatory from preferred, and flags what is missing, contradictory or unrealistic.',
    model: 'sonnet',
    needsResume: false,
  },
  budgeting: {
    label: 'Budgeting',
    blurb:
      'Hiring budget (CTC bands) and client billing rate, with the employer-cost build-up shown rather than asserted.',
    model: 'opus',
    needsResume: false,
  },
  resume_validation: {
    label: 'Resume Validation',
    blurb:
      'Scores a resume against a JD out of 100 with evidence, gaps, validation points and a confidence level.',
    model: 'opus',
    needsResume: true,
  },
  resume_formatting: {
    label: 'Resume Formatting',
    blurb:
      'Reformats a resume to a template without inventing content, bracketing anything the source does not support.',
    model: 'sonnet',
    needsResume: true,
  },
};

/**
 * The shared system prompt. Every agent gets the full role instructions —
 * the integrity rules (never invent, do not convert exposure into expertise,
 * label what needs validating) apply to all four, and trimming them per agent
 * would mean deciding which safeguards a given task can do without.
 */
export function systemPrompt(agent: AgentKind): string {
  const parts = [ROLE_INSTRUCTIONS()];

  // The playbook is procedure for handling a requirement end to end; it is
  // relevant to the two agents that sit inside that flow.
  if (agent === 'resume_validation' || agent === 'resume_formatting') {
    parts.push(
      '\n\n---\n\n# Requirement Fulfilment Playbook\n\n' + FULFILMENT_PLAYBOOK(),
    );
  }

  parts.push(
    [
      '\n\n---\n\n# Output medium',
      '',
      'Your answer is rendered as Markdown inside a recruitment application, not a chat.',
      '',
      '- Use the exact output structure the instructions above specify for this task.',
      '- Use Markdown tables where the instructions ask for tables.',
      '- Do not open with pleasantries or restate the request; begin with the analysis.',
      '- Do not offer to do further work at the end.',
      '- Where information is missing, say so in the output rather than asking a question and stopping — the user cannot reply mid-run.',
    ].join('\n'),
  );

  return parts.join('');
}

/** Per-agent task framing, appended to whatever the user supplied. */
export const TASK_PROMPTS: Record<AgentKind, string> = {
  jd_evaluator: [
    'Analyse the job description below.',
    '',
    'Produce, following the Job Description Analysis section of your instructions:',
    '1. The extracted and organised JD fields.',
    '2. Every major requirement classified Mandatory / Preferred / Good to have / Contextual.',
    '3. Missing hiring parameters that should be obtained before sourcing.',
    '4. Any contradictory, unclear or unrealistic requirements, stated plainly.',
    '5. A recommended resume evaluation scorecard for this specific role.',
  ].join('\n'),

  budgeting: [
    'Recommend both a hiring budget and a client billing rate for the role below.',
    '',
    'Follow the Salary Budget and Staffing Cost sections of your instructions. Specifically:',
    '- Keep candidate CTC, employer cost, and client billing clearly separate.',
    '- Show the employer-cost build-up rather than asserting a final number.',
    '- Do not use margin and markup interchangeably; show the formula you used.',
    '- State every assumption that materially affects the figures.',
    '- Where a commercial input is missing, give the three labelled scenarios',
    '  (minimum sustainable / recommended / premium) rather than one unsupported figure.',
    '- State currency, monthly or annual basis, and whether statutory costs are included.',
  ].join('\n'),

  resume_validation: [
    'Vet the candidate resume against the job description below.',
    '',
    'Produce the Standard Resume Vetting Output from your instructions, in full:',
    'Candidate Snapshot, Overall Assessment, Requirement Match, Score Breakdown,',
    'Key Strengths, Gaps and Concerns, Points Requiring Validation, Final Recommendation.',
    '',
    'Apply the Critical Override Rule: if a mandatory requirement is not met, say so',
    'explicitly no matter how high the overall score is.',
  ].join('\n'),

  resume_formatting: [
    'Reformat the candidate resume below.',
    '',
    'Follow the Resume Formatting and Conversion rules in your instructions. In particular:',
    '- Content comes only from the candidate resume; any reference template is structure only.',
    '- Invent nothing. Do not insert JD keywords the source does not support.',
    '- Bracket missing information, e.g. "[Project duration not mentioned]".',
    '- Finish with an "Information Requiring Confirmation" section for the internal team,',
    '  clearly separated from the formatted resume itself.',
  ].join('\n'),
};
