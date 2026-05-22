import type { TimeRange, TimeRangePreset } from '$lib/types';
import { query } from '$lib/duck/index.js';

const PRESET_DAYS: Record<Exclude<TimeRangePreset, 'ALL'>, number> = {
	P7D: 7,
	P30D: 30,
	P90D: 90,
	P365D: 365
};

/**
 * Resolve a preset or explicit TimeRange to a concrete {start, end} pair.
 * When `anchor` is provided the preset's end date is anchored to it instead
 * of the current clock — use the data's max date here so presets like "Last
 * 30 days" mean "30 days before the latest data point".
 */
export function resolveTimeRange(
	input: Exclude<TimeRangePreset, 'ALL'> | TimeRange,
	anchor?: Date
): TimeRange {
	if (typeof input === 'string') {
		const days = PRESET_DAYS[input];
		if (!days) throw new Error(`Unknown time range preset: ${input}`);
		const end = anchor ? new Date(anchor) : new Date();
		const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
		return { start, end };
	}
	return input;
}

/**
 * Query the actual MIN/MAX of the timeseries column from the model and return
 * a TimeRange that covers all data. The end is set one day past the max so
 * that the exclusive upper-bound filter (`timeseries < end`) includes the last
 * calendar day.
 */
export async function fetchDataTimeRange(model: string, timeseries: string): Promise<TimeRange> {
	const rows = await query<{ min_ts: unknown; max_ts: unknown }>(
		`SELECT MIN(${timeseries}) AS min_ts, MAX(${timeseries}) AS max_ts FROM ${model}`
	);
	const start = new Date(rows[0]?.min_ts as string | Date);
	const end = new Date(rows[0]?.max_ts as string | Date);
	if (isNaN(start.getTime()) || isNaN(end.getTime())) {
		throw new Error(`No data found in ${model}.${timeseries}`);
	}
	end.setUTCDate(end.getUTCDate() + 1);
	return { start, end };
}
