import { describe, expect, it } from 'vitest';
import { canAccess, canExport, canWrite, isExportPath, landingPath, HOLDING_PATH } from '@/lib/access';
import { PENDING_ROLES, ROLES } from '@/lib/auth';
import { USER_ROLES } from '@/lib/schema';

describe('pending roles (R23)', () => {
  it('the auth and schema role lists stay identical', () => {
    expect([...USER_ROLES]).toEqual([...ROLES]);
  });

  for (const role of PENDING_ROLES) {
    it(`${role} lands on the holding page`, () => {
      expect(landingPath(role)).toBe(HOLDING_PATH);
    });

    it(`${role} can open the holding page and sign out, and nothing else`, () => {
      expect(canAccess(role, HOLDING_PATH)).toBe(true);
      expect(canAccess(role, '/api/auth/logout')).toBe(true);
      for (const path of ['/', '/my', '/pipeline', '/candidates', '/resources', '/invoices', '/people', '/api/users', '/api/opportunities', '/api/candidates']) {
        expect(canAccess(role, path), path).toBe(false);
      }
    });

    it(`${role} cannot write anywhere outside the auth routes`, () => {
      for (const path of ['/api/opportunities', '/api/opportunities/3/stage', '/api/candidates', '/api/referrals/1', '/api/agents/run', '/api/users']) {
        expect(canWrite(role, path), path).toBe(false);
      }
    });
  }
});

describe('M65: resource and resource manager', () => {
  const backOffice = [
    '/',
    '/my',
    '/pipeline',
    '/candidates',
    '/resources',
    '/deployments',
    '/invoices',
    '/people',
    '/holidays',
    '/api/resources',
    '/api/deployments',
    '/api/invoices',
    '/api/holidays',
    '/api/users',
    '/api/timesheets/summary',
  ];

  it('are no longer held on the welcome page', () => {
    expect(PENDING_ROLES).not.toContain('resource');
    expect(PENDING_ROLES).not.toContain('resource_manager');
    expect(landingPath('resource')).toBe('/timesheet');
    expect(landingPath('resource_manager')).toBe('/approvals');
  });

  it('a resource opens its own timesheet and nothing else', () => {
    expect(canAccess('resource', '/timesheet')).toBe(true);
    expect(canAccess('resource', '/api/timesheets/mine')).toBe(true);
    expect(canAccess('resource', '/api/timesheets/mine/day')).toBe(true);
    expect(canAccess('resource', '/approvals')).toBe(false);
    expect(canAccess('resource', '/api/timesheets/approvals')).toBe(false);
    for (const path of backOffice) expect(canAccess('resource', path), path).toBe(false);
  });

  it('a resource writes only its own entries', () => {
    expect(canWrite('resource', '/api/timesheets/mine/day')).toBe(true);
    expect(canWrite('resource', '/api/timesheets/mine/submit')).toBe(true);
    expect(canWrite('resource', '/api/timesheets/approvals')).toBe(false);
    expect(canWrite('resource', '/api/holidays')).toBe(false);
    expect(canWrite('resource', '/api/invoices')).toBe(false);
  });

  it('a resource manager opens the approval queue and nothing else', () => {
    expect(canAccess('resource_manager', '/approvals')).toBe(true);
    expect(canAccess('resource_manager', '/api/timesheets/approvals')).toBe(true);
    expect(canAccess('resource_manager', '/timesheet')).toBe(false);
    expect(canAccess('resource_manager', '/api/timesheets/mine')).toBe(false);
    for (const path of backOffice) expect(canAccess('resource_manager', path), path).toBe(false);
  });

  it('a resource manager approves but cannot enter time or change settings', () => {
    expect(canWrite('resource_manager', '/api/timesheets/approvals')).toBe(true);
    expect(canWrite('resource_manager', '/api/timesheets/mine/day')).toBe(false);
    expect(canWrite('resource_manager', '/api/holidays')).toBe(false);
    expect(canWrite('resource_manager', '/api/deployments/3')).toBe(false);
  });

  it('the invoice summary and holidays stay with the back office', () => {
    expect(canAccess('admin', '/api/timesheets/summary')).toBe(true);
    expect(canAccess('management', '/api/timesheets/summary')).toBe(true);
    expect(canWrite('admin', '/api/holidays')).toBe(true);
    expect(canWrite('management', '/api/holidays')).toBe(false);
    for (const role of ['ta', 'leadgen', 'sales'] as const) {
      expect(canAccess(role, '/api/timesheets/summary'), role).toBe(false);
      expect(canAccess(role, '/timesheet'), role).toBe(false);
      expect(canAccess(role, '/approvals'), role).toBe(false);
    }
  });
});

describe('existing roles are unchanged (characterisation)', () => {
  it('landing pages', () => {
    expect(landingPath('admin')).toBe('/');
    expect(landingPath('management')).toBe('/');
    expect(landingPath('ta')).toBe('/my');
    expect(landingPath('leadgen')).toBe('/leads');
    expect(landingPath('sales')).toBe('/sales');
  });

  it('TA reads its surface and not the back office', () => {
    expect(canAccess('ta', '/pipeline')).toBe(true);
    expect(canAccess('ta', '/candidates/4')).toBe(true);
    expect(canAccess('ta', '/resources')).toBe(false);
    expect(canAccess('ta', '/invoices')).toBe(false);
  });

  it('TA writes fulfilment but not requirement creation or conversion', () => {
    expect(canWrite('ta', '/api/opportunities/3/candidates')).toBe(true);
    expect(canWrite('ta', '/api/opportunities')).toBe(false);
    expect(canWrite('ta', '/api/opportunities/3/convert')).toBe(false);
  });

  it('Management reads everything and writes nothing', () => {
    expect(canAccess('management', '/invoices')).toBe(true);
    expect(canWrite('management', '/api/invoices')).toBe(false);
  });

  it('Admin reads and writes everything', () => {
    expect(canAccess('admin', '/resources')).toBe(true);
    expect(canWrite('admin', '/api/invoices/2')).toBe(true);
  });
});

describe('CSV export is back office only', () => {
  const exportPaths = [
    '/api/candidates/export',
    '/api/applications/export',
    '/api/opportunities/export',
    '/api/resources/export',
    '/api/users/export',
    '/api/exports',
  ];

  it('Admin and Management may export', () => {
    for (const role of ['admin', 'management'] as const) {
      expect(canExport(role)).toBe(true);
      for (const path of exportPaths) expect(canAccess(role, path), path).toBe(true);
    }
  });

  it('every other role is refused, even on lists it can read (AE3)', () => {
    for (const role of ROLES.filter((r) => r !== 'admin' && r !== 'management')) {
      expect(canExport(role)).toBe(false);
      for (const path of exportPaths) expect(canAccess(role, path), `${role} ${path}`).toBe(false);
    }
    // The list itself stays readable.
    expect(canAccess('ta', '/api/candidates')).toBe(true);
    expect(canAccess('sales', '/api/opportunities')).toBe(true);
  });

  it('only a module-level export segment counts as an export', () => {
    expect(isExportPath('/api/candidates/export')).toBe(true);
    expect(isExportPath('/api/candidates/12')).toBe(false);
    expect(isExportPath('/api/opportunities/3/export')).toBe(false);
    expect(isExportPath('/api/exportsfoo')).toBe(false);
  });
});
