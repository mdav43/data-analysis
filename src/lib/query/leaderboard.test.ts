import { describe, it, expect } from 'vitest';
import { buildLeaderboardSQL } from './leaderboard';
import type { Measure, DimensionFilter } from '$lib/types';

const revenue: Measure = { name: 'total_revenue', label: 'Revenue', expr: 'SUM(amount)', format: 'usd' };
const range = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };

describe('buildLeaderboardSQL', () => {
  it('groups by the given dimension', () => {
    const sql = buildLeaderboardSQL({ measure: revenue, model: 'orders_enriched', dimension: 'country', range, timeseries: 'ordered_at', filters: [], topN: 10 });
    expect(sql).toContain('GROUP BY country');
    expect(sql).toContain('SUM(amount)');
  });

  it('orders by the measure descending', () => {
    const sql = buildLeaderboardSQL({ measure: revenue, model: 'orders_enriched', dimension: 'country', range, timeseries: 'ordered_at', filters: [], topN: 10 });
    expect(sql).toMatch(/ORDER BY .+ DESC/i);
  });

  it('limits to topN rows', () => {
    const sql = buildLeaderboardSQL({ measure: revenue, model: 'orders_enriched', dimension: 'country', range, timeseries: 'ordered_at', filters: [], topN: 5 });
    expect(sql).toContain('LIMIT 5');
  });

  it('respects active filters in WHERE', () => {
    const filters: DimensionFilter[] = [{ dimension: 'segment', value: 'Enterprise' }];
    const sql = buildLeaderboardSQL({ measure: revenue, model: 'orders_enriched', dimension: 'country', range, timeseries: 'ordered_at', filters, topN: 10 });
    expect(sql).toContain("segment = 'Enterprise'");
  });
});
