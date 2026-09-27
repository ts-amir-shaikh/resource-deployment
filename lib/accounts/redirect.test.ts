import { describe, expect, it } from 'vitest';
import { pathOf, safeNext } from './redirect';

describe('safeNext', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeNext('/resources?q=java')).toBe('/resources?q=java');
    expect(safeNext('/')).toBe('/');
  });

  it('refuses absolute and protocol-relative addresses', () => {
    expect(safeNext('https://evil.com/')).toBeNull();
    expect(safeNext('//evil.com')).toBeNull();
    expect(safeNext('evil.com')).toBeNull();
  });

  it('refuses the backslash and control-character forms that browsers read as //', () => {
    expect(safeNext('/\\evil.com')).toBeNull();
    expect(safeNext('/\t/evil.com')).toBeNull();
    expect(safeNext('/\n/evil.com')).toBeNull();
  });

  it('nothing given is no destination', () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext('')).toBeNull();
  });

  it('pathOf drops the query', () => {
    expect(pathOf('/resources?q=java')).toBe('/resources');
  });
});
