import { describe, it, expect } from 'vitest';
import { resolveTimeRange } from './timerange';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('resolveTimeRange', () => {
  it('P7D resolves to a 7-day window ending approximately now', () => {
    const range = resolveTimeRange('P7D');
    const days = (range.end.getTime() - range.start.getTime()) / MS_PER_DAY;
    expect(days).toBeCloseTo(7, 0);
    expect(range.end.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('P30D resolves to a ~30-day window', () => {
    const range = resolveTimeRange('P30D');
    const days = (range.end.getTime() - range.start.getTime()) / MS_PER_DAY;
    expect(days).toBeCloseTo(30, 0);
  });

  it('P90D resolves to a ~90-day window', () => {
    const range = resolveTimeRange('P90D');
    const days = (range.end.getTime() - range.start.getTime()) / MS_PER_DAY;
    expect(days).toBeCloseTo(90, 0);
  });

  it('P365D resolves to a ~365-day window', () => {
    const range = resolveTimeRange('P365D');
    const days = (range.end.getTime() - range.start.getTime()) / MS_PER_DAY;
    expect(days).toBeCloseTo(365, 0);
  });

  it('custom {start, end} passthrough returns those exact dates', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-03-31');
    const range = resolveTimeRange({ start, end });
    expect(range.start).toEqual(start);
    expect(range.end).toEqual(end);
  });

  it('throws for unrecognised preset string', () => {
    expect(() => resolveTimeRange('P5D' as any)).toThrow();
  });
});
