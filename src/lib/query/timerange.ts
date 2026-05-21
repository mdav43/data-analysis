import type { TimeRange, TimeRangePreset } from '$lib/types';

const PRESET_DAYS: Record<TimeRangePreset, number> = {
	P7D: 7,
	P30D: 30,
	P90D: 90,
	P365D: 365
};

export function resolveTimeRange(input: TimeRangePreset | TimeRange): TimeRange {
	if (typeof input === 'string') {
		const days = PRESET_DAYS[input as TimeRangePreset];
		if (!days) throw new Error(`Unknown time range preset: ${input}`);
		const end = new Date();
		const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
		return { start, end };
	}
	return input;
}
