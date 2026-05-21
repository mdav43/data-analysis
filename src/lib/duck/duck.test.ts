import { describe, it, expect, vi, beforeEach } from 'vitest';

// Since DuckDB WASM uses Workers (not available in Node/jsdom vitest),
// mock the @duckdb/duckdb-wasm module and test the wrapper logic.
vi.mock('@duckdb/duckdb-wasm', () => {
  const mockConn = {
    query: vi.fn().mockResolvedValue({
      toArray: () => [{ toJSON: () => ({ cnt: 5 }) }]
    }),
    close: vi.fn()
  };
  const mockDB = {
    connect: vi.fn().mockResolvedValue(mockConn),
    instantiate: vi.fn().mockResolvedValue(undefined),
    registerFileBuffer: vi.fn().mockResolvedValue(undefined),
  };
  return {
    AsyncDuckDB: vi.fn().mockImplementation(() => mockDB),
    ConsoleLogger: vi.fn(),
    selectBundle: vi.fn().mockResolvedValue({
      mainModule: 'mock.wasm',
      mainWorker: 'mock.worker.js'
    }),
    getJsDelivrBundles: vi.fn().mockReturnValue({})
  };
});

// Mock Worker global since jsdom doesn't have it
vi.stubGlobal('Worker', vi.fn().mockImplementation(() => ({})));

describe('DuckDB wrapper', () => {
  beforeEach(async () => {
    // Reset module between tests so singleton state is fresh
    vi.resetModules();
  });

  it('initDuckDB completes without throwing', async () => {
    const { initDuckDB } = await import('./index.js');
    await expect(initDuckDB()).resolves.toBeUndefined();
  });

  it('isDuckDBReady returns true after init', async () => {
    const { initDuckDB, isDuckDBReady } = await import('./index.js');
    expect(isDuckDBReady()).toBe(false);
    await initDuckDB();
    expect(isDuckDBReady()).toBe(true);
  });

  it('query returns an array of row objects', async () => {
    const { initDuckDB, query } = await import('./index.js');
    await initDuckDB();
    const rows = await query<{ cnt: number }>('SELECT count(*) as cnt FROM test');
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('cnt');
  });

  it('registerFileBuffer calls through to DuckDB', async () => {
    const { initDuckDB, registerFileBuffer } = await import('./index.js');
    await initDuckDB();
    const buf = new Uint8Array([1, 2, 3]);
    await expect(registerFileBuffer('test.csv', buf)).resolves.toBeUndefined();
  });

  it('query before init throws a readable error', async () => {
    const { query } = await import('./index.js');
    await expect(query('SELECT 1')).rejects.toThrow(/not initialized|init/i);
  });
});
