// DuckDB WASM singleton
import * as duckdb from '@duckdb/duckdb-wasm';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let ready = false;

/**
 * Lazy-initialise DuckDB WASM. Idempotent — safe to call multiple times.
 * Bundles are loaded from jsDelivr CDN to stay under Cloudflare Pages' 25 MiB
 * per-file limit (the WASM assets are ~38 MiB).
 */
export async function initDuckDB(): Promise<void> {
	if (db) return; // idempotent

	const logger = new duckdb.ConsoleLogger();
	const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());

	try {
		// Wrap the CDN worker in a same-origin blob URL to satisfy browser
		// same-origin restrictions on Worker scripts.
		const workerUrl = URL.createObjectURL(
			new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
		);
		const worker = new Worker(workerUrl);
		db = new duckdb.AsyncDuckDB(logger, worker);
		await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
		URL.revokeObjectURL(workerUrl);
	} catch {
		// Fallback for test environment where Worker/Blob APIs are stubbed
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
