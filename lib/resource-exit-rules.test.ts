import { describe, it, expect } from 'vitest';
import {
  accessUntilForExit,
  deploymentsPastExit,
  deploymentsStartingAfterExit,
  exitRefusal,
  exitState,
  hasExited,
} from './resource-exit-rules';

const open = { id: 1, projectName: 'Acme Core', startDate: '2026-01-01', endDate: null };
const endsAfter = { id: 2, projectName: 'Beta Platform', startDate: '2026-01-01', endDate: '2026-12-31' };
const endsOnExit = { id: 3, projectName: 'Gamma', startDate: '2026-01-01', endDate: '2026-11-30' };
const endsBefore = { id: 4, projectName: 'Delta', startDate: '2026-01-01', endDate: '2026-06-30' };

const EXIT = '2026-11-30';

describe('which deployments stand in the way', () => {
  it('counts an open-ended deployment', () => {
    expect(deploymentsPastExit([open], EXIT)).toEqual([open]);
  });

  it('counts one that runs past the exit', () => {
    expect(deploymentsPastExit([endsAfter], EXIT)).toEqual([endsAfter]);
  });

  // The tidy case: the engagement ends the day the person does.
  it('leaves one ending exactly on the exit date alone', () => {
    expect(deploymentsPastExit([endsOnExit], EXIT)).toEqual([]);
  });

  it('leaves a finished deployment alone', () => {
    expect(deploymentsPastExit([endsBefore], EXIT)).toEqual([]);
  });

  it('picks only the blocking ones out of a mixed list', () => {
    expect(deploymentsPastExit([open, endsAfter, endsOnExit, endsBefore], EXIT).map((d) => d.id)).toEqual([1, 2]);
  });
});

describe('whether the exit may go ahead (D17)', () => {
  it('allows it when nothing runs past the date', () => {
    expect(exitRefusal([endsOnExit, endsBefore], EXIT, false)).toBeNull();
  });

  it('allows it for a resource with no deployments at all', () => {
    expect(exitRefusal([], EXIT, false)).toBeNull();
  });

  it('refuses while one deployment is still running, and names it', () => {
    const refusal = exitRefusal([open], EXIT, false);
    expect(refusal).toContain('Acme Core');
    expect(refusal).toContain(EXIT);
  });

  it('counts and names them when several are running', () => {
    const refusal = exitRefusal([open, endsAfter], EXIT, false);
    expect(refusal).toContain('2 projects');
    expect(refusal).toContain('Acme Core');
    expect(refusal).toContain('Beta Platform');
  });

  // The operator has seen the list and chosen to end them.
  it('allows it once the operator ticks the box', () => {
    expect(exitRefusal([open, endsAfter], EXIT, true)).toBeNull();
  });
});

describe('a deployment that starts after the exit', () => {
  const future = { id: 5, projectName: 'Epsilon', startDate: '2027-01-01', endDate: null };

  it('is picked out, because ending it at the exit date would end it before it began', () => {
    expect(deploymentsStartingAfterExit([open, future], EXIT)).toEqual([future]);
  });

  it('finds none in an ordinary list', () => {
    expect(deploymentsStartingAfterExit([open, endsAfter], EXIT)).toEqual([]);
  });
});

describe('the linked account (D19)', () => {
  it('keeps access to the last day, never without a limit', () => {
    expect(accessUntilForExit(EXIT)).toBe(EXIT);
  });
});

describe('reading an exit', () => {
  it('knows who is on the roster', () => {
    expect(hasExited({ exitDate: null })).toBe(false);
    expect(hasExited({ exitDate: EXIT })).toBe(true);
  });

  it('separates serving notice from already gone', () => {
    expect(exitState({ exitDate: null }, '2026-11-20')).toBe('active');
    expect(exitState({ exitDate: '2026-11-30' }, '2026-11-20')).toBe('leaving');
    expect(exitState({ exitDate: '2026-11-30' }, '2026-11-30')).toBe('exited');
    expect(exitState({ exitDate: '2026-10-31' }, '2026-11-20')).toBe('exited');
  });
});
