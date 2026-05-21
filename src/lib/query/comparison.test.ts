import { describe, it, expect } from 'vitest';
import { buildComparisonRange, calculateDelta } from './comparison';

describe('buildComparisonRange', () => {
	it('returns a same-length window immediately before the selected range', () => {
		// Jan has 31 days, so 31 days before 2024-02-01 = 2024-01-01
		const range = { start: new Date('2024-02-01'), end: new Date('2024-03-03') };
		const comp = buildComparisonRange(range);
		// duration = 31 days; start shifts back 31 days from 2024-02-01 = 2024-01-01
		expect(comp.end.getTime()).toBe(range.start.getTime());
		const expectedStart = new Date(range.start.getTime() - (range.end.getTime() - range.start.getTime()));
		expect(comp.start.getTime()).toBe(expectedStart.getTime());
	});

	it('comparison end equals range start', () => {
		const range = { start: new Date('2024-06-01'), end: new Date('2024-07-01') };
		const comp = buildComparisonRange(range);
		expect(comp.end.getTime()).toBe(range.start.getTime());
	});

	it('duration of comparison window equals duration of selected range', () => {
		const range = { start: new Date('2024-01-15'), end: new Date('2024-01-22') };
		const comp = buildComparisonRange(range);
		const rangeDuration = range.end.getTime() - range.start.getTime();
		const compDuration = comp.end.getTime() - comp.start.getTime();
		expect(compDuration).toBe(rangeDuration);
	});
});

describe('calculateDelta', () => {
	it('computes absolute and percent delta', () => {
		const d = calculateDelta(120, 100);
		expect(d.absolute).toBe(20);
		expect(d.pct).toBeCloseTo(0.2);
	});

	it('returns null pct when previous is zero', () => {
		const d = calculateDelta(50, 0);
		expect(d.pct).toBeNull();
		expect(d.absolute).toBe(50);
	});

	it('handles negative deltas', () => {
		const d = calculateDelta(80, 100);
		expect(d.absolute).toBe(-20);
		expect(d.pct).toBeCloseTo(-0.2);
	});

	it('returns zero delta when values are equal', () => {
		const d = calculateDelta(100, 100);
		expect(d.absolute).toBe(0);
		expect(d.pct).toBe(0);
	});
});
