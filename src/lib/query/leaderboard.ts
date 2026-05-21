import type { Measure, TimeRange, DimensionFilter } from '$lib/types';

interface BuildLeaderboardSQLOptions {
	measure: Measure;
	model: string;
	dimension: string;
	range: TimeRange;
	timeseries: string;
	filters: DimensionFilter[];
	topN: number;
}

function formatDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function buildWhereClause(range: TimeRange, timeseries: string, filters: DimensionFilter[]): string {
	const conditions: string[] = [];
	conditions.push(`${timeseries} >= '${formatDate(range.start)}'`);
	conditions.push(`${timeseries} < '${formatDate(range.end)}'`);

	for (const f of filters) {
		conditions.push(`${f.dimension} = '${f.value}'`);
	}

	return `WHERE ${conditions.join('\nAND ')}`;
}

export function buildLeaderboardSQL(opts: BuildLeaderboardSQLOptions): string {
	const { measure, model, dimension, range, timeseries, filters, topN } = opts;
	const where = buildWhereClause(range, timeseries, filters);
	return [
		`SELECT ${dimension},`,
		`  ${measure.expr} AS value`,
		`FROM ${model}`,
		where,
		`GROUP BY ${dimension}`,
		`ORDER BY value DESC`,
		`LIMIT ${topN}`
	].join('\n');
}
