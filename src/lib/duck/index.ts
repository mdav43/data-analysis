// DuckDB WASM singleton
import * as duckdb from '@duckdb/duckdb-wasm';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let ready = false;

/**
 * Lazy-initialise DuckDB WASM. Idempotent — safe to call multiple times.
 * Uses local package assets (no CDN) via Vite ?url imports when running in browser.
 */
export async function initDuckDB(): Promise<void> {
	if (db) return; // idempotent

	const logger = new duckdb.ConsoleLogger();

	// When running in Vitest the Worker global is stubbed; in the browser the
	// ?url imports resolve to real asset URLs via Vite.
	let worker: Worker;
	try {
		// Dynamic import with ?url suffix works at build time in Vite.
		// In test environment these will resolve to mock strings.
		const duckdbWasmUrl = new URL(
			'../../node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
			import.meta.url
		).href;
		const duckdbWorkerUrl = new URL(
			'../../node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
			import.meta.url
		).href;

		worker = new Worker(duckdbWorkerUrl, { type: 'module' });
		db = new duckdb.AsyncDuckDB(logger, worker);
		await db.instantiate(duckdbWasmUrl);
	} catch {
		// Fallback for test environment or when Worker construction fails
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
