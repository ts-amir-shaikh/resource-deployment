import { describe, expect, it } from 'vitest';
import { poConsumption, type PoInvoice } from '@/lib/po-rules';

const inv = (amount: number, status: PoInvoice['status'] = 'raised', currency = 'INR'): PoInvoice => ({
  amount,
  status,
  currency,
});

describe('poConsumption', () => {
  it('sums raised invoices before GST and reports what is left', () => {
    const r = poConsumption({ value: 1000, currency: 'INR' }, [inv(300), inv(200, 'collected')]);
    expect(r).toMatchObject({ invoiced: 500, remaining: 500, consumed: 0.5, state: 'ok' });
  });

  it('does not count a draft that has not been raised', () => {
    expect(poConsumption({ value: 1000, currency: 'INR' }, [inv(900, 'not_raised')]).invoiced).toBe(0);
  });

  it('warns at 15% remaining and not above it', () => {
    expect(poConsumption({ value: 1000, currency: 'INR' }, [inv(850)]).state).toBe('low');
    expect(poConsumption({ value: 1000, currency: 'INR' }, [inv(849)]).state).toBe('ok');
  });

  it('flags exhausted and over-invoiced separately', () => {
    expect(poConsumption({ value: 1000, currency: 'INR' }, [inv(1000)]).state).toBe('exhausted');
    const over = poConsumption({ value: 1000, currency: 'INR' }, [inv(1200)]);
    expect(over.state).toBe('over');
    expect(over.remaining).toBe(-200);
  });

  it('never converts: another currency is left out and counted', () => {
    const r = poConsumption({ value: 1000, currency: 'INR' }, [inv(100), inv(5000, 'raised', 'USD')]);
    expect(r.invoiced).toBe(100);
    expect(r.otherCurrency).toBe(1);
  });

  it('a zero-value PO reads as exhausted with nothing consumed', () => {
    expect(poConsumption({ value: 0, currency: 'INR' }, [])).toMatchObject({ consumed: 0, state: 'exhausted' });
  });
});
