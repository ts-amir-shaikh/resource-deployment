import { describe, expect, it } from 'vitest';
import {
  activeInPeriod,
  averageScore,
  completion,
  dueInPeriod,
  isPeriod,
  isReviewEditable,
  isValidScore,
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
