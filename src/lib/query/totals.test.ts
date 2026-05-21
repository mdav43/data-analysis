import { describe, it, expect } from 'vitest';
import { buildTotalsSQL } from './totals';
import type { Measure, DimensionFilter } from '$lib/types';

const revenue: Measure = { name: 'total_revenue', label: 'Revenue', expr: 'SUM(amount)', format: 'usd' };
const range = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };

describe('buildTotalsSQL', () => {
  it('generates SELECT with the measure aggregate expression', () => {
    const sql = buildTotalsSQL({ measure: revenue, model: 'orders_enriched', range, filters: [] });
    expect(sql).toContain('SUM(amount)');
    expect(sql).toContain('FROM orders_enriched');
  });

  it('includes a WHERE clause for the time range', () => {
    const sql = buildTotalsSQL({ measure: revenue, model: 'orders_enriched', range, filters: [], timeseries: 'ordered_at' });
    expect(sql).toContain('WHERE');
    expect(sql).toContain('ordered_at');
    expect(sql).toContain('2024-01-01');
  });

  it('includes a WHERE clause for each active filter', () => {
    const filters: DimensionFilter[] = [{ dimension: 'country', value: 'US' }];
    const sql = buildTotalsSQL({ measure: revenue, model: 'orders_enriched', range, filters, timeseries: 'ordered_at' });
    expect(sql).toContain("country = 'US'");
  });

  it('stacks multiple filters with AND', () => {
    const filters: DimensionFilter[] = [
      { dimension: 'country', value: 'US' },
      { dimension: 'segment', value: 'Enterprise' }
    ];
    const sql = buildTotalsSQL({ measure: revenue, model: 'orders_enriched', range, filters, timeseries: 'ordered_at' });
    expect(sql).toContain("country = 'US'");
    expect(sql).toContain("segment = 'Enterprise'");
    expect(sql.match(/AND/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('formatMeasureValue formats USD correctly', () => {
    // Import and test separately
  });
});
