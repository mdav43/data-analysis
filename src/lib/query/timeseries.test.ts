import { describe, it, expect } from 'vitest';
import { buildTimeseriesSQL } from './timeseries';
import type { Measure, TimeGrain } from '$lib/types';

const revenue: Measure = { name: 'total_revenue', label: 'Revenue', expr: 'SUM(amount)', format: 'usd' };
const range = { start: new Date('2024-01-01'), end: new Date('2024-03-31') };

describe('buildTimeseriesSQL', () => {
  it.each([
    ['day', "date_trunc('day'"],
    ['week', "date_trunc('week'"],
    ['month', "date_trunc('month'"],
    ['hour', "date_trunc('hour'"],
    ['quarter', "date_trunc('quarter'"],
    ['year', "date_trunc('year'"],
  ] as [TimeGrain, string][])('grain=%s produces correct date_trunc', (grain, expected) => {
    const sql = buildTimeseriesSQL({ measure: revenue, model: 'orders_enriched', grain, range, timeseries: 'ordered_at', filters: [] });
    expect(sql).toContain(expected);
  });

  it('includes ORDER BY bucket', () => {
    const sql = buildTimeseriesSQL({ measure: revenue, model: 'orders_enriched', grain: 'day', range, timeseries: 'ordered_at', filters: [] });
    expect(sql).toMatch(/ORDER BY/i);
  });

  it('includes the measure aggregate', () => {
    const sql = buildTimeseriesSQL({ measure: revenue, model: 'orders_enriched', grain: 'day', range, timeseries: 'ordered_at', filters: [] });
    expect(sql).toContain('SUM(amount)');
  });
});
