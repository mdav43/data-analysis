// Schema introspection helpers built on top of the DuckDB singleton
import type { ColumnSchema } from '$lib/types';
import { query } from './index.js';

/**
 * Return column names and types for a registered DuckDB table.
 * Uses DESCRIBE which works for both tables and views.
 */
export async function getTableSchema(tableName: string): Promise<ColumnSchema[]> {
	const rows = await query<{ column_name: string; column_type: string }>(
		`DESCRIBE ${tableName}`
	);
	return rows.map((r) => ({ name: r.column_name, type: r.column_type }));
}

/**
 * Return the number of rows in a table.
 */
export async function getRowCount(tableName: string): Promise<number> {
	const rows = await query<{ cnt: number | bigint }>(`SELECT count(*) as cnt FROM ${tableName}`);
	const raw = rows[0]?.cnt ?? 0;
	// DuckDB may return BigInt for count(*)
	return Number(raw);
}

/**
 * Return up to `limit` sample rows from a table as plain JS objects.
 * Default limit is 5.
 */
export async function getSampleRows(
	tableName: string,
	limit = 5
): Promise<Record<string, unknown>[]> {
	return query<Record<string, unknown>>(`SELECT * FROM ${tableName} LIMIT ${limit}`);
}
