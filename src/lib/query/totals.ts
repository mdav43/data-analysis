import type { Measure, MeasureFormat, TimeRange, DimensionFilter } from '$lib/types';

interface BuildTotalsSQLOptions {
	measure: Measure;
	model: string;
	range: TimeRange;
	filters: DimensionFilter[];
	timeseries?: string;
}

function formatDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function buildWhereClause(range: TimeRange, timeseries: string | undefined, filters: DimensionFilter[]): string {
	const conditions: string[] = [];

	if (timeseries) {
		conditions.push(`${timeseries} >= '${formatDate(range.start)}'`);
		conditions.push(`${timeseries} < '${formatDate(range.end)}'`);
	}

	for (const f of filters) {
		conditions.push(`${f.dimension} = '${f.value}'`);
	}

	if (conditions.length === 0) return '';
	return `WHERE ${conditions.join('\nAND ')}`;
}

export function buildTotalsSQL(opts: BuildTotalsSQLOptions): string {
	const { measure, model, range, filters, timeseries } = opts;
	const where = buildWhereClause(range, timeseries, filters);
	let sql = `SELECT ${measure.expr} AS value\nFROM ${model}`;
	if (where) sql += `\n${where}`;
	return sql;
}

export function formatMeasureValue(value: number, format: MeasureFormat): string {
	switch (format) {
		case 'usd':
			return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
		case 'percent':
			return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(value);
		case 'number':
		default:
			return new Intl.NumberFormat('en-US').format(value);
	}
}
