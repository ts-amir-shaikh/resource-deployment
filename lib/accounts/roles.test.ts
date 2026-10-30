import { describe, expect, it } from 'vitest';
import { canAccess, canExport, canWrite, isExportPath, landingPath, navFor, stripClientBilling, HOLDING_PATH } from '@/lib/access';
import { clientBillingSchema } from '@/lib/validations';
import { defaultDueDate } from '@/lib/utils';
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

describe('M66: leadgen pipeline', () => {
  const pages = ['/prospects', '/prospects/4', '/campaigns', '/campaigns/2', '/lead-records', '/lead-records/9'];
  const reads = ['/api/leadgen/prospects', '/api/leadgen/prospects/4', '/api/leadgen/leads', '/api/leadgen/duplicates'];

  it('Leadgen, Sales, Admin and Management reach the new screens and routes', () => {
    for (const role of ['leadgen', 'sales', 'admin', 'management'] as const) {
      for (const path of [...pages, ...reads]) expect(canAccess(role, path), `${role} ${path}`).toBe(true);
    }
  });

  it('every other role is refused (AE6)', () => {
    for (const role of ROLES.filter((r) => !['leadgen', 'sales', 'admin', 'management'].includes(r))) {
      for (const path of [...pages, ...reads]) expect(canAccess(role, path), `${role} ${path}`).toBe(false);
      expect(canWrite(role, '/api/leadgen/prospects'), role).toBe(false);
    }
  });

  it('Leadgen writes everything on its side but never assigns a salesperson (Q2)', () => {
    for (const path of [
      '/api/leadgen/prospects',
      '/api/leadgen/prospects/4',
      '/api/leadgen/prospects/4/contacts',
      '/api/leadgen/prospects/4/convert',
      '/api/leadgen/campaigns',
      '/api/leadgen/activities',
      '/api/leadgen/leads',
      '/api/leadgen/leads/9',
      '/api/leadgen/leads/9/handoff',
    ]) {
      expect(canWrite('leadgen', path), path).toBe(true);
    }
    expect(canWrite('leadgen', '/api/leadgen/leads/9/assign')).toBe(false);
  });

  it('Sales works handed-off leads only: no prospects, campaigns, conversion or handoff', () => {
    expect(canWrite('sales', '/api/leadgen/leads/9')).toBe(true);
    expect(canWrite('sales', '/api/leadgen/leads/9/assign')).toBe(true);
    expect(canWrite('sales', '/api/leadgen/activities')).toBe(true);
    for (const path of [
      '/api/leadgen/prospects',
      '/api/leadgen/prospects/4',
      '/api/leadgen/prospects/4/convert',
      '/api/leadgen/campaigns',
      '/api/leadgen/leads',
      '/api/leadgen/leads/9/handoff',
    ]) {
      expect(canWrite('sales', path), path).toBe(false);
    }
  });

  it('Management reads and writes nothing; Admin writes all', () => {
    expect(canWrite('management', '/api/leadgen/prospects')).toBe(false);
    expect(canWrite('admin', '/api/leadgen/leads/9/assign')).toBe(true);
  });

  it('the Leadgen sidebar keeps My Leads beside the three new screens (Q1)', () => {
    expect(navFor('leadgen').map((n) => n.href)).toEqual(['/leads', '/prospects', '/campaigns', '/lead-records', '/pipeline']);
    expect(navFor('ta').map((n) => n.href)).not.toContain('/prospects');
  });
});

describe('FSD-18 v1.1: the timesheet dashboard is Admin only (D20)', () => {
  const paths = ['/timesheets', '/api/timesheets/dashboard', '/api/timesheets/entries'];

  it('Admin reaches it, and every other role is refused — Management included', () => {
    for (const path of paths) {
      expect(canAccess('admin', path), path).toBe(true);
      for (const role of ROLES.filter((r) => r !== 'admin')) {
        expect(canAccess(role, path), `${role} ${path}`).toBe(false);
      }
    }
  });

  it('is a different prefix from a resource\'s own timesheet', () => {
    expect(canAccess('resource', '/timesheet')).toBe(true);
    expect(canAccess('resource', '/timesheets')).toBe(false);
    expect(canAccess('management', '/timesheet')).toBe(true);
  });

  it('leaves the other timesheet routes as they were', () => {
    expect(canAccess('management', '/api/timesheets/summary')).toBe(true);
    expect(canAccess('resource_manager', '/api/timesheets/approvals')).toBe(true);
    expect(canAccess('resource', '/api/timesheets/mine')).toBe(true);
  });

  it('is a read surface: nobody but Admin writes under it', () => {
    expect(canWrite('management', '/api/timesheets/dashboard')).toBe(false);
    expect(canWrite('resource_manager', '/api/timesheets/dashboard')).toBe(false);
  });
});

describe('FSD-21: leave requests', () => {
  it('a resource reaches its own leave and nothing of the approvals', () => {
    expect(canAccess('resource', '/leaves')).toBe(true);
    expect(canAccess('resource', '/api/leaves/mine')).toBe(true);
    expect(canAccess('resource', '/api/leaves/mine/4')).toBe(true);
    expect(canWrite('resource', '/api/leaves/mine')).toBe(true);
    expect(canWrite('resource', '/api/leaves/mine/4')).toBe(true);
    expect(canAccess('resource', '/api/leaves/approvals')).toBe(false);
    expect(canAccess('resource', '/approvals')).toBe(false);
  });

  it('the Resource Manager reads and decides the queue, but has no leave of its own', () => {
    expect(canAccess('resource_manager', '/api/leaves/approvals')).toBe(true);
    expect(canWrite('resource_manager', '/api/leaves/approvals')).toBe(true);
    expect(canAccess('resource_manager', '/api/leaves/mine')).toBe(false);
    expect(canAccess('resource_manager', '/leaves')).toBe(false);
  });

  it('Management can read everything and write nothing', () => {
    expect(canAccess('management', '/api/leaves/approvals')).toBe(true);
    expect(canWrite('management', '/api/leaves/approvals')).toBe(false);
    expect(canWrite('management', '/api/leaves/mine')).toBe(false);
  });

  it('TA, Leadgen and Sales are refused', () => {
    for (const role of ['ta', 'leadgen', 'sales'] as const) {
      for (const path of ['/leaves', '/api/leaves/mine', '/api/leaves/approvals']) {
        expect(canAccess(role, path), `${role} ${path}`).toBe(false);
      }
      expect(canWrite(role, '/api/leaves/approvals'), role).toBe(false);
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

describe('M67: reviews and the skill matrix', () => {
  const reviewPages = ['/reviews', '/reviews/performance/4', '/reviews/accounts/2', '/skills'];
  const reviewApis = ['/api/reviews', '/api/reviews/performance/4', '/api/reviews/accounts/2', '/api/reviews/criteria', '/api/skills'];

  it('a resource manager opens reviews and skills, and still nothing back-office', () => {
    for (const path of [...reviewPages, ...reviewApis]) expect(canAccess('resource_manager', path), path).toBe(true);
    for (const path of ['/resources', '/clients', '/deployments', '/invoices', '/api/resources', '/api/clients']) {
      expect(canAccess('resource_manager', path), path).toBe(false);
    }
    expect(navFor('resource_manager').map((n) => n.href)).toEqual(['/approvals', '/reviews', '/skills']);
  });

  it('a resource manager writes and submits reviews and skill levels', () => {
    for (const path of [
      '/api/reviews/performance',
      '/api/reviews/performance/4',
      '/api/reviews/performance/4/submit',
      '/api/reviews/accounts',
      '/api/reviews/accounts/2',
      '/api/reviews/accounts/2/submit',
      '/api/reviews/criteria',
      '/api/reviews/criteria/3',
      '/api/skills',
      '/api/skills/7',
      '/api/skills/resources/5',
    ]) {
      expect(canWrite('resource_manager', path), path).toBe(true);
    }
  });

  it('only Admin approves, returns or reopens a review (Q3)', () => {
    for (const path of [
      '/api/reviews/performance/4/approve',
      '/api/reviews/performance/4/return',
      '/api/reviews/performance/4/reopen',
      '/api/reviews/accounts/2/approve',
      '/api/reviews/accounts/2/return',
      '/api/reviews/accounts/2/reopen',
    ]) {
      expect(canWrite('resource_manager', path), path).toBe(false);
      expect(canWrite('management', path), path).toBe(false);
      expect(canWrite('sales', path), path).toBe(false);
      expect(canWrite('admin', path), path).toBe(true);
    }
  });

  it('Admin signs reviews off but does not write or submit them', () => {
    for (const path of [
      '/api/reviews/performance/4',
      '/api/reviews/performance/4/submit',
      '/api/reviews/accounts/2',
      '/api/reviews/accounts/2/submit',
    ]) {
      expect(canWrite('admin', path), path).toBe(false);
      expect(canWrite('resource_manager', path), path).toBe(true);
    }
  });

  it('Management reads everything and writes nothing', () => {
    for (const path of [...reviewPages, ...reviewApis]) {
      expect(canAccess('management', path), path).toBe(true);
      expect(canWrite('management', path), path).toBe(false);
    }
  });

  it('Sales reads account reviews only, and writes none (Q5)', () => {
    expect(canAccess('sales', '/reviews/accounts')).toBe(true);
    expect(canAccess('sales', '/reviews/accounts/2')).toBe(true);
    expect(canAccess('sales', '/api/reviews/accounts')).toBe(true);
    expect(canAccess('sales', '/api/reviews/accounts/2')).toBe(true);
    for (const path of ['/reviews', '/reviews/performance/4', '/skills', '/api/reviews', '/api/reviews/performance/4', '/api/reviews/criteria', '/api/skills']) {
      expect(canAccess('sales', path), path).toBe(false);
    }
    for (const path of ['/api/reviews/accounts', '/api/reviews/accounts/2', '/api/reviews/accounts/2/submit']) {
      expect(canWrite('sales', path), path).toBe(false);
    }
    expect(navFor('sales').map((n) => n.href)).toContain('/reviews/accounts');
    expect(navFor('sales').map((n) => n.href)).not.toContain('/reviews');
  });

  it('resources never see their reviews; TA and Leadgen see none', () => {
    for (const role of ['resource', 'ta', 'leadgen'] as const) {
      for (const path of [...reviewPages, ...reviewApis, '/reviews/accounts', '/api/reviews/accounts']) {
        expect(canAccess(role, path), `${role} ${path}`).toBe(false);
        expect(canWrite(role, path), `${role} ${path}`).toBe(false);
      }
    }
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

describe('M62: accounts', () => {
  it('is no longer held on the welcome page and lands on the invoices', () => {
    expect(PENDING_ROLES).not.toContain('accounts');
    expect(landingPath('accounts')).toBe('/invoices');
  });

  it('opens the billing screens and the figures behind them', () => {
    for (const path of [
      '/invoices', '/invoices/3', '/agreements', '/agreements/2', '/clients', '/clients/4',
      '/projects', '/deployments', '/resources', '/resources/5',
      '/api/invoices', '/api/agreements', '/api/clients', '/api/resources', '/api/deployments',
    ]) {
      expect(canAccess('accounts', path), path).toBe(true);
    }
  });

  it('opens nothing else', () => {
    for (const path of [
      '/', '/my', '/pipeline', '/candidates', '/agents', '/people', '/reviews', '/skills',
      '/timesheets', '/timesheet', '/approvals', '/prospects', '/campaigns', '/lead-records', '/holidays',
      '/api/opportunities', '/api/candidates', '/api/users', '/api/timesheets/dashboard', '/api/leadgen/leads',
      '/api/reviews', '/api/skills', '/api/dashboard/pipeline',
    ]) {
      expect(canAccess('accounts', path), path).toBe(false);
    }
  });

  it('writes invoices, agreements and client billing details', () => {
    for (const path of [
      '/api/invoices', '/api/invoices/3', '/api/invoices/3/advance', '/api/invoices/bulk-advance',
      '/api/agreements', '/api/agreements/2', '/api/agreements/2/renew', '/api/agreements/2/correct',
      '/api/clients/4/billing',
    ]) {
      expect(canWrite('accounts', path), path).toBe(true);
    }
  });

  it('cannot rewrite or delete a client, or write anywhere else', () => {
    for (const path of [
      '/api/clients', '/api/clients/4', '/api/projects', '/api/projects/2', '/api/deployments',
      '/api/resources', '/api/resources/5', '/api/users', '/api/opportunities', '/api/reviews/performance/1',
    ]) {
      expect(canWrite('accounts', path), path).toBe(false);
    }
  });

  it('cannot export in bulk', () => {
    expect(canExport('accounts')).toBe(false);
    expect(canAccess('accounts', '/api/invoices/export')).toBe(false);
  });

  it('sees the billing screens in its navigation and no pipeline', () => {
    const hrefs = navFor('accounts').map((n) => n.href);
    expect(hrefs).toEqual(expect.arrayContaining(['/invoices', '/agreements', '/clients']));
    expect(hrefs).not.toContain('/pipeline');
    expect(hrefs).not.toContain('/people');
  });

  it('billing details are stripped for the pipeline roles and kept for billing and back office', () => {
    const row = { id: 1, companyName: 'Acme', gstin: '27AAPFU0939F1ZV', billingAddress: 'x', paymentTerms: 'Net 30', defaultDueDays: 30 };
    for (const role of ['ta', 'leadgen', 'sales', 'resource', 'resource_manager'] as const) {
      expect(stripClientBilling(role, row)).toEqual({ id: 1, companyName: 'Acme' });
    }
    for (const role of ['admin', 'management', 'accounts'] as const) {
      expect(stripClientBilling(role, row)).toEqual(row);
    }
  });
});

describe('M62: client billing details', () => {
  it('accepts a valid GSTIN, upper-casing it', () => {
    expect(clientBillingSchema.parse({ gstin: '27aapfu0939f1zv' }).gstin).toBe('27AAPFU0939F1ZV');
  });

  it('rejects a malformed GSTIN and a bad due-days value', () => {
    expect(clientBillingSchema.safeParse({ gstin: 'NOTAGSTIN' }).success).toBe(false);
    expect(clientBillingSchema.safeParse({ defaultDueDays: 0 }).success).toBe(false);
    expect(clientBillingSchema.safeParse({ defaultDueDays: 1.5 }).success).toBe(false);
  });

  it('reads empty strings as cleared, not as zero', () => {
    const r = clientBillingSchema.parse({ gstin: '', billingAddress: '', paymentTerms: '', defaultDueDays: '' });
    expect(r).toEqual({ gstin: undefined, billingAddress: undefined, paymentTerms: undefined, defaultDueDays: undefined });
  });

  it('derives a due date from the invoice date and default days', () => {
    expect(defaultDueDate('2026-01-15', 30)).toBe('2026-02-14');
    expect(defaultDueDate('2026-12-20', 30)).toBe('2027-01-19');
    expect(defaultDueDate(undefined, 30)).toBeUndefined();
    expect(defaultDueDate('2026-01-15', null)).toBeUndefined();
  });
});
