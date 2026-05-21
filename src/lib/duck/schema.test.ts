import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @duckdb/duckdb-wasm so schema functions go through our duck wrapper
vi.mock('@duckdb/duckdb-wasm', () => {
  const mockConn = {
    query: vi.fn(),
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

vi.stubGlobal('Worker', vi.fn().mockImplementation(() => ({})));

describe('schema helpers', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('getTableSchema returns array of ColumnSchema objects', async () => {
    // Set up mock to return DESCRIBE-like result
    const duckdb = await import('@duckdb/duckdb-wasm');
    const mockDB = new (duckdb.AsyncDuckDB as any)();
    const mockConn = await mockDB.connect();
    mockConn.query.mockResolvedValue({
      toArray: () => [
        { toJSON: () => ({ column_name: 'id', column_type: 'INTEGER' }) },
        { toJSON: () => ({ column_name: 'name', column_type: 'VARCHAR' }) }
      ]
    });

    const { initDuckDB } = await import('./index.js');
    await initDuckDB();
    const { getTableSchema } = await import('./schema.js');

    const schema = await getTableSchema('orders');
    expect(Array.isArray(schema)).toBe(true);
    expect(schema.length).toBe(2);
    expect(schema[0]).toHaveProperty('name');
    expect(schema[0]).toHaveProperty('type');
    expect(schema[0].name).toBe('id');
    expect(schema[0].type).toBe('INTEGER');
  });

  it('getRowCount returns a number', async () => {
    const duckdb = await import('@duckdb/duckdb-wasm');
    const mockDB = new (duckdb.AsyncDuckDB as any)();
    const mockConn = await mockDB.connect();
    mockConn.query.mockResolvedValue({
      toArray: () => [
        { toJSON: () => ({ cnt: 42 }) }
      ]
    });

    const { initDuckDB } = await import('./index.js');
    await initDuckDB();
    const { getRowCount } = await import('./schema.js');

    const count = await getRowCount('orders');
    expect(typeof count).toBe('number');
    expect(count).toBe(42);
  });

  it('getSampleRows returns array of plain objects', async () => {
    const duckdb = await import('@duckdb/duckdb-wasm');
    const mockDB = new (duckdb.AsyncDuckDB as any)();
    const mockConn = await mockDB.connect();
    mockConn.query.mockResolvedValue({
      toArray: () => [
        { toJSON: () => ({ id: 1, name: 'Alice' }) },
        { toJSON: () => ({ id: 2, name: 'Bob' }) }
      ]
    });

    const { initDuckDB } = await import('./index.js');
    await initDuckDB();
    const { getSampleRows } = await import('./schema.js');

    const rows = await getSampleRows('orders', 5);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
    expect(rows[0]).toHaveProperty('id');
    expect(rows[0]).toHaveProperty('name');
  });

  it('getSampleRows uses default limit of 5', async () => {
    const duckdb = await import('@duckdb/duckdb-wasm');
    const mockDB = new (duckdb.AsyncDuckDB as any)();
    const mockConn = await mockDB.connect();
    mockConn.query.mockResolvedValue({
      toArray: () => []
    });

    const { initDuckDB } = await import('./index.js');
    await initDuckDB();
    const { getSampleRows } = await import('./schema.js');

    // Should not throw when called without limit
    await expect(getSampleRows('orders')).resolves.toBeDefined();
    // Verify the query included LIMIT 5
    expect(mockConn.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT 5')
    );
  });
});
