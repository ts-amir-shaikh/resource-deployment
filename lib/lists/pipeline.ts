import type { PipelineRow } from './load/pipeline';
import { compactParams, matchesSearch, type ListDef } from './types';
import { ENGAGEMENT_LABELS, STAGE_LABELS, WORK_MODE_LABELS, opportunityValue } from '@/lib/utils';

export type PipelineFilters = {
  search: string;
  showClosed: boolean;
  /** Company name, '' for every company. */
  company: string;
  /** List view only — the board groups by stage in its columns instead. */
  stage: string;
  /** List view only: longest in stage first. */
  oldestFirst: boolean;
};

export const pipelineList: ListDef<PipelineRow, PipelineFilters> = {
  list: 'pipeline',
  columns: [
    { key: 'title', label: 'Requirement', value: (o) => o.title, defaultOn: true },
    { key: 'companyName', label: 'Company', value: (o) => o.companyName, defaultOn: true },
    { key: 'isProspect', label: 'Prospect (not yet a client)', value: (o) => o.isProspect },
    { key: 'stage', label: 'Stage', value: (o) => STAGE_LABELS[o.stage] ?? o.stage, defaultOn: true },
    { key: 'stageSince', label: 'In stage since', value: (o) => o.stageSince.slice(0, 10) },
    { key: 'priority', label: 'Priority', value: (o) => o.priority, defaultOn: true },
    { key: 'primarySkill', label: 'Primary skill', value: (o) => o.primarySkill, defaultOn: true },
    { key: 'secondarySkill', label: 'Secondary skill', value: (o) => o.secondarySkill },
    { key: 'experienceMin', label: 'Experience from (years)', value: (o) => o.experienceMin },
    { key: 'experienceMax', label: 'Experience to (years)', value: (o) => o.experienceMax },
    { key: 'engagementType', label: 'Engagement', value: (o) => (o.engagementType ? ENGAGEMENT_LABELS[o.engagementType] ?? o.engagementType : null), defaultOn: true },
    { key: 'workMode', label: 'Work mode', value: (o) => (o.workMode ? WORK_MODE_LABELS[o.workMode] ?? o.workMode : null) },
    { key: 'location', label: 'Location', value: (o) => o.location },
    { key: 'timezone', label: 'Timezone', value: (o) => o.timezone },
    { key: 'requiredCount', label: 'Positions', value: (o) => o.requiredCount, defaultOn: true },
    { key: 'filledCount', label: 'Filled', value: (o) => o.filledCount, defaultOn: true },
    { key: 'mappedCount', label: 'Candidates mapped', value: (o) => o.mappedCount },
    { key: 'currency', label: 'Currency', value: (o) => o.currency },
    { key: 'budgetMin', label: 'Client budget from', value: (o) => o.budgetMin },
    { key: 'budgetMax', label: 'Client budget to', value: (o) => o.budgetMax },
    { key: 'hiringBudgetMin', label: 'Hiring budget from', value: (o) => o.hiringBudgetMin },
    { key: 'hiringBudgetMax', label: 'Hiring budget to', value: (o) => o.hiringBudgetMax },
    { key: 'dealValue', label: 'Deal value', value: (o) => o.dealValue },
    { key: 'pipelineValue', label: 'Pipeline value', value: (o) => opportunityValue(o) },
    { key: 'leadOwnerName', label: 'Lead owner', value: (o) => o.leadOwnerName },
    { key: 'salesOwnerName', label: 'Sales owner', value: (o) => o.salesOwnerName, defaultOn: true },
    { key: 'nextStep', label: 'Next step', value: (o) => o.nextStep, defaultOn: true },
    { key: 'nextStepDate', label: 'Next step date', value: (o) => o.nextStepDate, defaultOn: true },
    { key: 'followUpDue', label: 'Follow-up due', value: (o) => o.followUpDue },
    { key: 'isListed', label: 'On job board', value: (o) => o.isListed },
    { key: 'closedReason', label: 'Closed reason', value: (o) => o.closedReason },
    { key: 'createdAt', label: 'Raised on', value: (o) => o.createdAt.slice(0, 10) },
  ],
  filterRows: (rows, f) => {
    const out = rows.filter((o) => {
      if (!f.showClosed && ['won', 'lost'].includes(o.stage)) return false;
      if (f.company && o.companyName !== f.company) return false;
      if (f.stage !== 'all' && o.stage !== f.stage) return false;
      return matchesSearch(f.search, o.title, o.companyName, o.primarySkill, o.location);
    });
    return f.oldestFirst ? out.sort((a, b) => a.stageSince.localeCompare(b.stageSince)) : out;
  },
  toParams: (f) =>
    compactParams(
      {
        search: f.search.trim(),
        showClosed: f.showClosed ? '1' : null,
        company: f.company,
        stage: f.stage,
        oldestFirst: f.oldestFirst ? '1' : null,
      },
      { stage: 'all' },
    ),
  fromParams: (p) => ({
    search: p.get('search') ?? '',
    showClosed: p.get('showClosed') === '1',
    company: p.get('company') ?? '',
    stage: p.get('stage') && p.get('stage') !== 'all' ? (p.get('stage') as string) : 'all',
    oldestFirst: p.get('oldestFirst') === '1',
  }),
};
