import { describe, expect, it } from 'vitest';
import {
  billedDaysLabel,
  deploymentMoney,
  invoiceLineMath,
  invoiceLineRow,
  nextInvoiceStatus,
  opportunityValue,
  sumByCurrency,
  type InvoiceLineBasis,
} from './utils';

/**
 * Baseline for the money paths (M65 U1, scoping risk R2).
 *
 * These pin down what the code does today, before timesheets start supplying
 * the leave figures. They are not a statement that every rule is right — a
 * test that pins a questionable behaviour says so — but a change to any of
 * these numbers must now be a deliberate one, made by editing a test.
 */

const MARCH: Pick<InvoiceLineBasis, 'periodFrom' | 'periodTo'> = {
  periodFrom: '2026-03-01',
  periodTo: '2026-03-31',
};

function line(overrides: Partial<InvoiceLineBasis> = {}): InvoiceLineBasis {
  return {
    monthlyRate: 220_000,
    workingDays: 22,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    deploymentDate: null,
    lastWorkingDate: null,
    ...MARCH,
    ...overrides,
  };
}

describe('invoiceLineMath', () => {
  it('bills a whole month exactly, with no rounding', () => {
    const m = invoiceLineMath(line());
    expect(m.daysInPeriod).toBe(31);
    expect(m.daysOnSite).toBe(31);
    expect(m.availableDays).toBe(22);
    expect(m.billedDays).toBe(22);
    expect(m.amount).toBe(220_000);
    expect(m.prorated).toBe(false);
  });

  it('deducts unpaid leave from billed days and amount', () => {
    const m = invoiceLineMath(line({ unpaidLeaveDays: 2 }));
    expect(m.billedDays).toBe(20);
    expect(m.amount).toBe(200_000);
    expect(m.prorated).toBe(true);
  });

  it('records paid leave without deducting it', () => {
    const m = invoiceLineMath(line({ paidLeaveDays: 3 }));
    expect(m.billedDays).toBe(22);
    expect(m.paidLeaveDays).toBe(3);
    expect(m.amount).toBe(220_000);
  });

  it('allows half days of unpaid leave', () => {
    const m = invoiceLineMath(line({ unpaidLeaveDays: 1.5 }));
    expect(m.billedDays).toBe(20.5);
    expect(m.amount).toBe(205_000);
  });

  it('pro-rates a mid-month join by calendar share, rounded to the half day', () => {
    // On from the 15th: 17 of 31 days → 22 × 17/31 = 12.06 → 12.
    const m = invoiceLineMath(line({ deploymentDate: '2026-03-15' }));
    expect(m.daysOnSite).toBe(17);
    expect(m.availableDays).toBe(12);
    expect(m.billedDays).toBe(12);
    expect(m.amount).toBe(120_000);
  });

  it('pro-rates a mid-month roll-off', () => {
    // Off after the 10th: 10 of 31 days → 22 × 10/31 = 7.10 → 7.
    const m = invoiceLineMath(line({ lastWorkingDate: '2026-03-10' }));
    expect(m.daysOnSite).toBe(10);
    expect(m.availableDays).toBe(7);
    expect(m.amount).toBe(70_000);
  });

  it('ignores join and leave dates outside the period', () => {
    const m = invoiceLineMath(
      line({ deploymentDate: '2026-01-01', lastWorkingDate: '2026-06-30' }),
    );
    expect(m.daysOnSite).toBe(31);
    expect(m.billedDays).toBe(22);
  });

  it('floors billed days at zero when leave exceeds the month', () => {
    const m = invoiceLineMath(line({ unpaidLeaveDays: 30 }));
    expect(m.billedDays).toBe(0);
    expect(m.amount).toBe(0);
  });

  it('treats negative leave as none', () => {
    const m = invoiceLineMath(line({ unpaidLeaveDays: -3, paidLeaveDays: -1 }));
    expect(m.billedDays).toBe(22);
    expect(m.paidLeaveDays).toBe(0);
  });

  it('bills a flat month when working days are not set', () => {
    for (const workingDays of [null, 0]) {
      const m = invoiceLineMath(line({ workingDays, unpaidLeaveDays: 5 }));
      expect(m.availableDays).toBeNull();
      expect(m.billedDays).toBeNull();
      expect(m.amount).toBe(220_000);
      expect(m.prorated).toBe(false);
    }
  });

  it('does not bill zero while the period is half typed', () => {
    const m = invoiceLineMath(line({ periodTo: '', unpaidLeaveDays: 2 }));
    expect(m.daysInPeriod).toBe(0);
    expect(m.billedDays).toBe(20);
    expect(m.amount).toBe(200_000);
  });

  it('treats a period that ends before it starts as unusable', () => {
    const m = invoiceLineMath(line({ periodFrom: '2026-03-31', periodTo: '2026-03-01' }));
    expect(m.daysInPeriod).toBe(0);
    expect(m.billedDays).toBe(22);
  });

  it('bills nothing when the resource was never on site in the period', () => {
    const m = invoiceLineMath(line({ deploymentDate: '2026-03-20', lastWorkingDate: '2026-03-10' }));
    expect(m.daysOnSite).toBe(0);
    expect(m.billedDays).toBe(0);
    expect(m.amount).toBe(0);
  });

  it('rounds the amount to the whole unit', () => {
    const m = invoiceLineMath(line({ monthlyRate: 100_000, unpaidLeaveDays: 1 }));
    // 100000 × 21 / 22 = 95454.54…
    expect(m.amount).toBe(95_455);
  });
});

describe('billedDaysLabel', () => {
  it('labels a pro-rated line', () => {
    expect(billedDaysLabel(invoiceLineMath(line({ unpaidLeaveDays: 4 })), 22)).toBe('18 of 22 days');
  });

  it('labels a flat line as a full month', () => {
    expect(billedDaysLabel(invoiceLineMath(line({ workingDays: null })), null)).toBe('Full month');
  });
});

describe('invoiceLineRow', () => {
  it('stores the server-computed billed days and amount, not anything sent', () => {
    const row = invoiceLineRow(
      { resourceId: 7, monthlyRate: 220_000, workingDays: 22, paidLeaveDays: 1, unpaidLeaveDays: 2 },
      MARCH,
    );
    expect(row).toEqual({
      resourceId: 7,
      monthlyRate: 220_000,
      workingDays: 22,
      paidLeaveDays: 1,
      unpaidLeaveDays: 2,
      deploymentDate: null,
      lastWorkingDate: null,
      billedDays: 20,
      amount: 200_000,
    });
  });

  it('stores null working days for a flat line', () => {
    const row = invoiceLineRow(
      { resourceId: 7, monthlyRate: 50_000, paidLeaveDays: 0, unpaidLeaveDays: 0 },
      MARCH,
    );
    expect(row.workingDays).toBeNull();
    expect(row.billedDays).toBeNull();
    expect(row.amount).toBe(50_000);
  });
});

describe('sumByCurrency', () => {
  it('sums within a currency and never across', () => {
    const totals = sumByCurrency([
      { currency: 'INR', amount: 100 },
      { currency: 'AED', amount: 40 },
      { currency: 'INR', amount: 50 },
    ]);
    expect(totals).toEqual([
      { currency: 'INR', amount: 150 },
      { currency: 'AED', amount: 40 },
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(sumByCurrency([])).toEqual([]);
  });
});

describe('nextInvoiceStatus', () => {
  it('moves forward one step at a time', () => {
    expect(nextInvoiceStatus('not_raised')).toBe('raised');
    expect(nextInvoiceStatus('raised')).toBe('pending_collection');
    expect(nextInvoiceStatus('pending_collection')).toBe('collected');
  });

  it('has nowhere to go from the end or from an unknown status', () => {
    expect(nextInvoiceStatus('collected')).toBeNull();
    expect(nextInvoiceStatus('void')).toBeNull();
  });
});

describe('opportunityValue', () => {
  it('returns null, never zero, when nothing is priced', () => {
    expect(opportunityValue({ requiredCount: 3 })).toBeNull();
    expect(opportunityValue({ dealValue: null, budgetMin: null, budgetMax: null, requiredCount: 1 })).toBeNull();
  });

  it('prefers the deal value', () => {
    expect(opportunityValue({ dealValue: 500, budgetMax: 900, requiredCount: 2 })).toBe(500);
  });

  it('keeps an explicit zero deal value', () => {
    expect(opportunityValue({ dealValue: 0, budgetMax: 900, requiredCount: 2 })).toBe(0);
  });

  it('uses the top of the budget range times headcount', () => {
    expect(opportunityValue({ budgetMin: 100, budgetMax: 150, requiredCount: 2 })).toBe(300);
    expect(opportunityValue({ budgetMin: 100, requiredCount: 0 })).toBe(100);
  });
});

describe('deploymentMoney', () => {
  const base = {
    billingAmount: 200_000,
    commissionAmount: 10_000,
    operationsOverhead: 5_000,
    gstApplicable: true,
    allocationPercentage: 100,
    currency: 'INR',
    deploymentType: 'billable' as const,
    annualCtc: 1_200_000,
  };

  it('computes margin from billing less pro-rated CTC, commission and overhead', () => {
    const m = deploymentMoney(base);
    expect(m.gst).toBe(36_000);
    expect(m.total).toBe(236_000);
    expect(m.ctcCost).toBe(100_000);
    expect(m.margin).toBe(85_000);
    expect(m.marginNote).toBeNull();
  });

  it('pro-rates CTC by allocation', () => {
    expect(deploymentMoney({ ...base, allocationPercentage: 50 }).ctcCost).toBe(50_000);
  });

  it('withholds margin when the deployment is not in INR', () => {
    const m = deploymentMoney({ ...base, currency: 'AED', gstApplicable: false });
    expect(m.margin).toBeNull();
    expect(m.marginNote).toBe('needs-rate');
    expect(m.gst).toBe(0);
  });

  it('withholds margin when CTC is unknown', () => {
    const m = deploymentMoney({ ...base, annualCtc: null });
    expect(m.margin).toBeNull();
    expect(m.marginNote).toBe('no-ctc');
  });

  it('flags a shadow deployment as a cost', () => {
    expect(deploymentMoney({ ...base, deploymentType: 'shadow', billingAmount: 0 }).isCost).toBe(true);
  });
});
