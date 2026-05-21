import type { TimeRange } from '$lib/types';

export function buildComparisonRange(range: TimeRange): TimeRange {
	const duration = range.end.getTime() - range.start.getTime();
	return {
		start: new Date(range.start.getTime() - duration),
		end: range.start
	};
}

export interface DeltaResult {
	absolute: number;
	pct: number | null;
}

export function calculateDelta(current: number, previous: number): DeltaResult {
	return {
		absolute: current - previous,
		pct: previous !== 0 ? (current - previous) / Math.abs(previous) : null
	};
}
