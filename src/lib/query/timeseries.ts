import type { Measure, TimeGrain, TimeRange, DimensionFilter } from '$lib/types';

interface BuildTimeseriesSQLOptions {
	measure: Measure;
	model: string;
	grain: TimeGrain;
	range: TimeRange;
	timeseries: string;
	filters: DimensionFilter[];
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

export function buildTimeseriesSQL(opts: BuildTimeseriesSQLOptions): string {
	const { measure, model, grain, range, timeseries, filters } = opts;
	const where = buildWhereClause(range, timeseries, filters);
	return [
		`SELECT date_trunc('${grain}', ${timeseries}) AS bucket,`,
		`  ${measure.expr} AS value`,
		`FROM ${model}`,
		where,
		`GROUP BY bucket`,
		`ORDER BY bucket`
	].join('\n');
}
