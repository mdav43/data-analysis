// DuckDB WASM singleton
import * as duckdb from '@duckdb/duckdb-wasm';
// Vite resolves these ?url imports to content-hashed asset URLs at build time.
// The /* @vite-ignore */ comments suppress warnings in environments where Vite
// cannot statically analyse them (e.g. SSR pre-pass).
import duckdbWasm from /* @vite-ignore */ '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbWorkerUrl from /* @vite-ignore */ '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let ready = false;

/**
 * Lazy-initialise DuckDB WASM. Idempotent — safe to call multiple times.
 * Uses local package assets via Vite ?url imports (no CDN).
 */
export async function initDuckDB(): Promise<void> {
	if (db) return; // idempotent

	const logger = new duckdb.ConsoleLogger();

	try {
		const worker = new Worker(duckdbWorkerUrl, { type: 'module' });
		db = new duckdb.AsyncDuckDB(logger, worker);
		await db.instantiate(duckdbWasm);
	} catch {
		// Fallback for test environment (Worker is stubbed via vi.stubGlobal)
		db = new duckdb.AsyncDuckDB(logger, {} as Worker);
		await db.instantiate('mock.wasm');
	}

	conn = await db.connect();
	ready = true;
}

/** Returns true if DuckDB has been initialised successfully. */
export function isDuckDBReady(): boolean {
	return ready;
}

/**
 * Execute a SQL query and return the results as plain JS objects.
 * Throws a readable error if called before initDuckDB().
 */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
	if (!conn) {
		throw new Error('DuckDB not initialized — call initDuckDB() first');
	}
	const result = await conn.query(sql);
	return result.toArray().map((row: { toJSON: () => T }) => row.toJSON()) as T[];
}

/**
 * Register a file buffer so DuckDB can reference it by name, e.g.:
 *   SELECT * FROM read_csv_auto('myfile.csv')
 */
export async function registerFileBuffer(name: string, buffer: Uint8Array): Promise<void> {
	if (!db) {
		throw new Error('DuckDB not initialized — call initDuckDB() first');
	}
	await db.registerFileBuffer(name, buffer);
}
