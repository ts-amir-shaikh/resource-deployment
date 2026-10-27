import { describe, expect, it } from 'vitest';
import {
  activeInPeriod,
  averageScore,
  changeNoteError,
  diffAccount,
  diffPerformance,
  completion,
  dueInPeriod,
  extraLabelKey,
  extraScoresError,
  isPeriod,
  isReviewEditable,
  isValidScore,
  MAX_EXTRA_SCORES,
  normaliseSkillName,
  periodBounds,
  periodOf,
  reviewTransition,
  shiftPeriod,
  skillKey,
  skillNamesFromResources,
  submitError,
  type ReviewStatus,
} from './review-rules';

describe('review status (Q3)', () => {
  it('a draft is submitted, a submitted review is approved or returned', () => {
    expect(reviewTransition('draft', 'submit')).toEqual({ to: 'submitted' });
    expect(reviewTransition('submitted', 'approve')).toEqual({ to: 'approved' });
    expect(reviewTransition('submitted', 'return')).toEqual({ to: 'draft' });
  });

  it('refuses every other move', () => {
    expect(reviewTransition('submitted', 'submit').error).toBeTruthy();
    expect(reviewTransition('approved', 'submit').error).toBeTruthy();
    expect(reviewTransition('draft', 'approve').error).toBeTruthy();
    expect(reviewTransition('draft', 'return').error).toBeTruthy();
    expect(reviewTransition('approved', 'approve').error).toBeTruthy();
    expect(reviewTransition('approved', 'return').error).toBeTruthy();
  });

  it('only a draft is editable', () => {
    expect(isReviewEditable('draft')).toBe(true);
    expect(isReviewEditable('submitted')).toBe(false);
    expect(isReviewEditable('approved')).toBe(false);
  });
});

describe('scores', () => {
  it('accepts whole numbers 1 to 5 only', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(isValidScore(n)).toBe(true);
    for (const n of [0, 6, 2.5, -1, NaN, null, undefined, '3']) expect(isValidScore(n)).toBe(false);
  });

  it('averages to one decimal place', () => {
    expect(averageScore([4, 3, 5])).toBe(4);
    expect(averageScore([4, 3])).toBe(3.5);
    expect(averageScore([5, 4, 4])).toBe(4.3);
  });

  it('is null, not 0, when nothing is scored', () => {
    expect(averageScore([])).toBeNull();
    expect(averageScore([null, undefined])).toBeNull();
  });

  it('ignores missing and invalid scores rather than counting them as 0', () => {
    expect(averageScore([4, null, 2, undefined])).toBe(3);
    expect(averageScore([4, 0, 9])).toBe(4);
  });

  it('a review is submittable only when every criterion is scored', () => {
    expect(submitError([1, 2], [{ criterionId: 1, score: 3 }, { criterionId: 2, score: 4 }])).toBeNull();
    expect(submitError([1, 2], [{ criterionId: 1, score: 3 }])).toMatch(/one is missing/);
    expect(submitError([1, 2, 3], [])).toMatch(/3 are missing/);
    expect(submitError([1], [{ criterionId: 1, score: null }])).toMatch(/missing/);
    expect(submitError([], [])).toBeNull();
  });
});

describe('periods', () => {
  it('recognises YYYY-MM months only', () => {
    expect(isPeriod('2026-10')).toBe(true);
    for (const p of ['2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', '', null, undefined, 202610]) {
      expect(isPeriod(p)).toBe(false);
    }
  });

  it('knows the first and last day, including February', () => {
    expect(periodBounds('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodBounds('2026-04').to).toBe('2026-04-30');
  });

  it('moves across years', () => {
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2026-10', -12)).toBe('2025-10');
    expect(periodOf('2026-10-23')).toBe('2026-10');
  });
});

describe('what is due', () => {
  const p = '2026-10';

  it('a deployment active on any day of the month owes a review', () => {
    expect(activeInPeriod({ startDate: '2026-01-01', endDate: null }, p)).toBe(true);
    expect(activeInPeriod({ startDate: '2026-10-31', endDate: null }, p)).toBe(true);
    expect(activeInPeriod({ startDate: '2026-09-01', endDate: '2026-10-01' }, p)).toBe(true);
    expect(activeInPeriod({ startDate: '2026-09-01', endDate: '' }, p)).toBe(true);
  });

  it('one that ended before the month or starts after it does not', () => {
    expect(activeInPeriod({ startDate: '2026-01-01', endDate: '2026-09-30' }, p)).toBe(false);
    expect(activeInPeriod({ startDate: '2026-11-01', endDate: null }, p)).toBe(false);
    expect(activeInPeriod({ startDate: '', endDate: null }, p)).toBe(false);
  });

  it('a client is due an account review when any of its deployments is', () => {
    const deps = [
      { id: 1, clientId: 7, startDate: '2026-01-01', endDate: null },
      { id: 2, clientId: 7, startDate: '2026-02-01', endDate: '2026-03-31' },
      { id: 3, clientId: 3, startDate: '2026-10-15', endDate: null },
      { id: 4, clientId: 9, startDate: '2026-12-01', endDate: null },
    ];
    const due = dueInPeriod(deps, p);
    expect(due.deployments.map((d) => d.id)).toEqual([1, 3]);
    expect(due.clientIds).toEqual([3, 7]);
  });

  it('counts completion against what is due', () => {
    const statuses = new Map<number, ReviewStatus>([
      [1, 'draft'],
      [2, 'approved'],
      [3, 'submitted'],
      [99, 'approved'], // not due this month: not counted
    ]);
    expect(completion([1, 2, 3, 4, 5], statuses)).toEqual({ due: 5, notStarted: 2, draft: 1, submitted: 1, approved: 1 });
    expect(completion([], statuses)).toEqual({ due: 0, notStarted: 0, draft: 0, submitted: 0, approved: 0 });
  });
});

describe('skills', () => {
  it('normalises whitespace and compares without case', () => {
    expect(normaliseSkillName('  React   Native ')).toBe('React Native');
    expect(normaliseSkillName(null)).toBe('');
    expect(skillKey('REACT native')).toBe(skillKey('react  Native'));
  });

  it('collects distinct names from free-text resource skills', () => {
    const names = skillNamesFromResources([
      { primarySkill: 'Java', secondarySkill: 'react', otherSkills: '["AWS", " java ", ""]' },
      { primarySkill: 'React', secondarySkill: null, otherSkills: 'not json' },
      { primarySkill: null, secondarySkill: '  ', otherSkills: null },
      { primarySkill: 'Kotlin', secondarySkill: null, otherSkills: '{"a":1}' },
    ]);
    expect(names).toEqual(['AWS', 'Java', 'Kotlin', 'react']);
  });
});

describe('extra criteria on one review', () => {
  it('an extra score moves the average like any other', () => {
    expect(averageScore([5, 5, 4, 5])).toBe(4.8);
    expect(averageScore([5, 5, 4, 5, 2])).toBe(4.2);
  });

  it('an unscored extra is left out of the average, never counted as 0', () => {
    expect(averageScore([4, 4, null])).toBe(4);
  });

  it('an unscored extra stops a submit, the same as a missing criterion', () => {
    const scores = [{ criterionId: 1, score: 4 }];
    expect(submitError([1], scores, [{ score: null }])).toMatch(/one is missing/);
    expect(submitError([1], scores, [{ score: 3 }])).toBeNull();
    expect(submitError([1], scores)).toBeNull();
  });

  it('counts a missing criterion and a missing extra together', () => {
    expect(submitError([1, 2], [{ criterionId: 1, score: 4 }], [{ score: null }])).toMatch(/2 are missing/);
  });

  it('refuses a blank, duplicate or too many extras', () => {
    expect(extraScoresError([{ label: 'Mentoring' }])).toBeNull();
    expect(extraScoresError([{ label: '  ' }])).toMatch(/Name every/);
    expect(extraScoresError([{ label: 'Mentoring' }, { label: ' mentoring ' }])).toMatch(/already on this review/);
    const many = Array.from({ length: MAX_EXTRA_SCORES + 1 }, (_, i) => ({ label: `Extra ${i}` }));
    expect(extraScoresError(many)).toMatch(/At most/);
  });

  it('refuses an extra named like a standard criterion', () => {
    expect(extraScoresError([{ label: 'communication' }], ['Technical skill', 'Communication'])).toMatch(/already on this review/);
    expect(extraScoresError([{ label: 'Mentoring' }], ['Technical skill', 'Communication'])).toBeNull();
  });

  it('compares labels without case or spacing', () => {
    expect(extraLabelKey('  On   Call ')).toBe('on call');
  });
});

describe('reopening a locked review', () => {
  it('Admin can reopen a submitted or an approved review, never a draft', () => {
    expect(reviewTransition('submitted', 'reopen')).toEqual({ to: 'draft' });
    expect(reviewTransition('approved', 'reopen')).toEqual({ to: 'draft' });
    expect(reviewTransition('draft', 'reopen').error).toBeTruthy();
  });

  it('return still only reaches a submitted review', () => {
    expect(reviewTransition('approved', 'return').error).toBeTruthy();
  });

  it('a locked review is not edited in place by anyone', () => {
    expect(isReviewEditable('draft')).toBe(true);
    expect(isReviewEditable('submitted')).toBe(false);
    expect(isReviewEditable('approved')).toBe(false);
  });
});

describe('change note', () => {
  it('the first version needs none', () => {
    expect(changeNoteError(0, null)).toBeNull();
    expect(changeNoteError(0, '')).toBeNull();
  });

  it('every later version has to say what changed', () => {
    expect(changeNoteError(1, null)).toMatch(/what changed/);
    expect(changeNoteError(1, '   ')).toMatch(/what changed/);
    expect(changeNoteError(2, 'Raised Communication to 5')).toBeNull();
  });
});

describe('what changed between versions', () => {
  const base = {
    summary: 'Good month.',
    strengths: null,
    improvements: null,
    clientFeedback: null,
    clientFeedbackBy: null,
    clientFeedbackDate: null,
    scores: [
      { label: 'Technical skill', score: 4, note: null },
      { label: 'Communication', score: 3, note: null },
    ],
    extras: [{ label: 'Mentoring', score: 4, note: null }],
    average: 3.7,
  };

  it('is empty when nothing differs', () => {
    expect(diffPerformance(base, { ...base })).toEqual([]);
  });

  it('lists a changed score, with the average that moved with it', () => {
    const next = { ...base, scores: [base.scores[0], { label: 'Communication', score: 5, note: null }], average: 4.3 };
    expect(diffPerformance(base, next)).toEqual([
      { field: 'Communication', from: '3', to: '5' },
      { field: 'Average', from: '3.7', to: '4.3' },
    ]);
  });

  it('lists an extra criterion that was added or removed', () => {
    const added = { ...base, extras: [...base.extras, { label: 'On-call', score: 2, note: null }] };
    expect(diffPerformance(base, added)).toContainEqual({ field: 'Extra: On-call', from: null, to: '2' });
    const removed = { ...base, extras: [] };
    expect(diffPerformance(base, removed)).toContainEqual({ field: 'Extra: Mentoring', from: '4', to: null });
  });

  it('matches criteria by name, ignoring case and spacing', () => {
    const next = { ...base, scores: [{ label: ' technical skill ', score: 4, note: null }, base.scores[1]] };
    expect(diffPerformance(base, next)).toEqual([]);
  });

  it('lists changed text, and treats blank and missing as the same', () => {
    const next = { ...base, summary: 'Excellent month.', strengths: '  ' };
    expect(diffPerformance(base, next)).toEqual([{ field: 'Summary', from: 'Good month.', to: 'Excellent month.' }]);
  });

  it('compares an account review field by field', () => {
    const a = { rating: 'green' as const, summary: 's', risks: null, opportunities: null, actions: 'x' };
    expect(diffAccount(a, { ...a, rating: 'amber', actions: 'y' })).toEqual([
      { field: 'Rating', from: 'green', to: 'amber' },
      { field: 'Actions', from: 'x', to: 'y' },
    ]);
  });
});
