import { describe, it, expect, beforeEach } from 'vitest';
import type { SourceConfig, ModelConfig, DashboardConfig } from '$lib/types';

// Imports from implementation (will fail until implemented):
import { parseConfig, serializeConfig, ConfigValidationError, exportConfigYaml, importConfigYaml } from './index';
import { saveConfig, loadConfig, clearConfig } from './storage';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleSource: SourceConfig = {
	kind: 'source',
	name: 'orders',
	type: 'csv',
	file: 'orders.csv'
};

const sampleSourceWithTables: SourceConfig = {
	kind: 'source',
	name: 'warehouse',
	type: 'duckdb',
	file: 'warehouse.duckdb',
	tables: ['orders', 'customers', 'products']
};

const sampleModel: ModelConfig = {
	kind: 'model',
	name: 'orders_enriched',
	sql: 'SELECT * FROM orders',
	materialize: 'view'
};

const sampleModelTable: ModelConfig = {
	kind: 'model',
	name: 'orders_summary',
	sql: 'SELECT date_trunc(\'day\', created_at) as day, SUM(amount) as total FROM orders GROUP BY 1',
	materialize: 'table'
};

const sampleDashboard: DashboardConfig = {
	kind: 'dashboard',
	name: 'orders_dashboard',
	model: 'orders_enriched',
	timeseries: 'created_at',
	default_time_range: 'P30D',
	default_grain: 'day',
	comparison: {
		enabled: true,
		mode: 'previous_period'
	},
	dimensions: [
		{ name: 'region', column: 'region' },
		{ name: 'product_category', column: 'product_category' }
	],
	measures: [
		{ name: 'total_revenue', label: 'Total Revenue', expr: 'SUM(amount)', format: 'usd' },
		{ name: 'order_count', label: 'Order Count', expr: 'COUNT(*)', format: 'number' },
		{ name: 'conversion_rate', label: 'Conversion Rate', expr: 'SUM(converted) / COUNT(*)', format: 'percent' }
	],
	layout: {
		metric_cards: ['total_revenue', 'order_count'],
		timeseries_measure: 'total_revenue',
		leaderboard_dimensions: ['region', 'product_category']
	}
};

// ── Config schema validation ──────────────────────────────────────────────────

describe('Config schema validation', () => {
	it('parseConfig accepts a valid SourceConfig', () => {
		const result = parseConfig(sampleSource);
		expect(result).toEqual(sampleSource);
		expect((result as SourceConfig).kind).toBe('source');
		expect((result as SourceConfig).name).toBe('orders');
		expect((result as SourceConfig).type).toBe('csv');
		expect((result as SourceConfig).file).toBe('orders.csv');
	});

	it('parseConfig accepts a valid SourceConfig with optional tables', () => {
		const result = parseConfig(sampleSourceWithTables);
		expect(result).toEqual(sampleSourceWithTables);
		expect((result as SourceConfig).tables).toEqual(['orders', 'customers', 'products']);
	});

	it('parseConfig accepts a valid ModelConfig', () => {
		const result = parseConfig(sampleModel);
		expect(result).toEqual(sampleModel);
		expect((result as ModelConfig).kind).toBe('model');
		expect((result as ModelConfig).materialize).toBe('view');
	});

	it('parseConfig accepts a valid DashboardConfig', () => {
		const result = parseConfig(sampleDashboard);
		expect(result).toEqual(sampleDashboard);
		expect((result as DashboardConfig).kind).toBe('dashboard');
		expect((result as DashboardConfig).measures).toHaveLength(3);
		expect((result as DashboardConfig).dimensions).toHaveLength(2);
	});

	it('parseConfig throws ConfigValidationError when kind is missing', () => {
		const raw = { name: 'foo', type: 'csv', file: 'foo.csv' };
		expect(() => parseConfig(raw)).toThrow(ConfigValidationError);
		expect(() => parseConfig(raw)).toThrow(/kind/i);
	});

	it('parseConfig throws ConfigValidationError for unknown kind', () => {
		const raw = { kind: 'chart', name: 'foo' };
		expect(() => parseConfig(raw)).toThrow(ConfigValidationError);
		expect(() => parseConfig(raw)).toThrow(/unknown kind/i);
	});

	it('parseConfig throws ConfigValidationError when required fields are absent for source', () => {
		const raw = { kind: 'source', name: 'foo' }; // missing type and file
		expect(() => parseConfig(raw)).toThrow(ConfigValidationError);
	});

	it('parseConfig throws ConfigValidationError when required fields are absent for model', () => {
		const raw = { kind: 'model', name: 'foo' }; // missing sql and materialize
		expect(() => parseConfig(raw)).toThrow(ConfigValidationError);
	});

	it('parseConfig throws ConfigValidationError when required fields are absent for dashboard', () => {
		const raw = { kind: 'dashboard', name: 'foo' }; // missing many required fields
		expect(() => parseConfig(raw)).toThrow(ConfigValidationError);
	});

	it('parseConfig throws ConfigValidationError for non-object input', () => {
		expect(() => parseConfig(null)).toThrow(ConfigValidationError);
		expect(() => parseConfig('string')).toThrow(ConfigValidationError);
		expect(() => parseConfig(42)).toThrow(ConfigValidationError);
		expect(() => parseConfig([])).toThrow(ConfigValidationError);
	});

	it('parseConfig throws ConfigValidationError for invalid source type', () => {
		const raw = { kind: 'source', name: 'foo', type: 'parquet', file: 'foo.parquet' };
		expect(() => parseConfig(raw)).toThrow(ConfigValidationError);
	});

	it('parseConfig throws ConfigValidationError for invalid model materialize', () => {
		const raw = { kind: 'model', name: 'foo', sql: 'SELECT 1', materialize: 'materialized_view' };
		expect(() => parseConfig(raw)).toThrow(ConfigValidationError);
	});
});

// ── YAML round-trip ───────────────────────────────────────────────────────────

describe('YAML round-trip', () => {
	it('serializeConfig + parseConfig is lossless for SourceConfig', () => {
		const yamlStr = serializeConfig([sampleSource]);
		const parsed = importConfigYaml(yamlStr);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]).toEqual(sampleSource);
	});

	it('serializeConfig + parseConfig is lossless for SourceConfig with tables', () => {
		const yamlStr = serializeConfig([sampleSourceWithTables]);
		const parsed = importConfigYaml(yamlStr);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]).toEqual(sampleSourceWithTables);
	});

	it('serializeConfig + parseConfig is lossless for ModelConfig', () => {
		const yamlStr = serializeConfig([sampleModel]);
		const parsed = importConfigYaml(yamlStr);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]).toEqual(sampleModel);
	});

	it('serializeConfig + parseConfig is lossless for DashboardConfig (full)', () => {
		const yamlStr = serializeConfig([sampleDashboard]);
		const parsed = importConfigYaml(yamlStr);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]).toEqual(sampleDashboard);
	});

	it('serializeConfig produces valid YAML string', () => {
		const yamlStr = serializeConfig([sampleSource]);
		expect(typeof yamlStr).toBe('string');
		expect(yamlStr.length).toBeGreaterThan(0);
		expect(yamlStr).toContain('kind: source');
		expect(yamlStr).toContain('orders.csv');
	});

	it('exportConfigYaml produces valid YAML from multiple configs', () => {
		const yamlStr = exportConfigYaml([sampleSource, sampleModel]);
		expect(typeof yamlStr).toBe('string');
		expect(yamlStr).toContain('kind: source');
		expect(yamlStr).toContain('kind: model');
		// Multi-doc YAML uses --- separator
		expect(yamlStr).toContain('---');
	});

	it('importConfigYaml restores configs from exported YAML', () => {
		const configs = [sampleSource, sampleModel, sampleDashboard];
		const yamlStr = exportConfigYaml(configs);
		const restored = importConfigYaml(yamlStr);
		expect(restored).toHaveLength(3);
		expect(restored[0]).toEqual(sampleSource);
		expect(restored[1]).toEqual(sampleModel);
		expect(restored[2]).toEqual(sampleDashboard);
	});

	it('importConfigYaml throws ConfigValidationError for invalid YAML content', () => {
		// Valid YAML but invalid config (missing kind)
		const badYaml = 'name: foo\ntype: csv\nfile: foo.csv\n';
		expect(() => importConfigYaml(badYaml)).toThrow(ConfigValidationError);
	});

	it('importConfigYaml handles single-document YAML', () => {
		const yamlStr = serializeConfig([sampleModel]);
		const result = importConfigYaml(yamlStr);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual(sampleModel);
	});
});

// ── localStorage persistence ──────────────────────────────────────────────────

describe('localStorage persistence', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('saveConfig stores configs; loadConfig retrieves them', () => {
		const configs = [sampleSource, sampleModel];
		saveConfig(configs);
		const loaded = loadConfig();
		expect(loaded).not.toBeNull();
		expect(loaded).toHaveLength(2);
		expect(loaded![0]).toEqual(sampleSource);
		expect(loaded![1]).toEqual(sampleModel);
	});

	it('saveConfig persists a full DashboardConfig without loss', () => {
		saveConfig([sampleDashboard]);
		const loaded = loadConfig();
		expect(loaded).toHaveLength(1);
		expect(loaded![0]).toEqual(sampleDashboard);
	});

	it('loadConfig returns null when localStorage is empty', () => {
		const result = loadConfig();
		expect(result).toBeNull();
	});

	it('loadConfig returns null when localStorage has corrupt data', () => {
		localStorage.setItem('ducklens_config', 'not-valid-json{{{');
		const result = loadConfig();
		expect(result).toBeNull();
	});

	it('clearConfig removes the stored config', () => {
		saveConfig([sampleSource]);
		clearConfig();
		const result = loadConfig();
		expect(result).toBeNull();
	});

	it('loadConfig returns null after clearConfig', () => {
		saveConfig([sampleSource, sampleModel]);
		clearConfig();
		expect(loadConfig()).toBeNull();
	});

	it('saveConfig overwrites previously stored config', () => {
		saveConfig([sampleSource]);
		saveConfig([sampleModel]);
		const loaded = loadConfig();
		expect(loaded).toHaveLength(1);
		expect((loaded![0] as ModelConfig).kind).toBe('model');
	});
});
