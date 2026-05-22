// Shared TypeScript types for DuckLens

// ── Source ──────────────────────────────────────────────────────────────────
export interface SourceConfig {
	kind: 'source';
	name: string;
	type: 'csv' | 'duckdb';
	file: string;
	tables?: string[];
}

// ── Model ────────────────────────────────────────────────────────────────────
export interface ModelConfig {
	kind: 'model';
	name: string;
	sql: string;
	materialize: 'view' | 'table';
}

// ── Dimension / Measure ──────────────────────────────────────────────────────
export interface Dimension {
	name: string;
	column: string;
}

export type MeasureFormat = 'usd' | 'number' | 'percent';

export interface Measure {
	name: string;
	label: string;
	expr: string;
	format: MeasureFormat;
}

// ── Dashboard (Metrics View + Dashboard config) ──────────────────────────────
export interface DashboardConfig {
	kind: 'dashboard';
	name: string;
	model: string;
	timeseries: string;
	default_time_range: string;
	default_grain: TimeGrain;
	comparison?: {
		enabled: boolean;
		mode: 'previous_period';
	};
	dimensions: Dimension[];
	measures: Measure[];
	layout: {
		metric_cards: string[];
		timeseries_measure: string;
		leaderboard_dimensions: string[];
	};
}

export type AnyConfig = SourceConfig | ModelConfig | DashboardConfig;

// ── Time ─────────────────────────────────────────────────────────────────────
export type TimeGrain = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface TimeRange {
	start: Date;
	end: Date;
}

export type TimeRangePreset = 'P7D' | 'P30D' | 'P90D' | 'P365D' | 'ALL';

// ── Query Results ─────────────────────────────────────────────────────────────
export interface TotalsRow {
	measure_name: string;
	value: number;
}

export interface TimeseriesRow {
	bucket: string;
	value: number;
}

export interface LeaderboardRow {
	dimension_value: string;
	value: number;
	delta?: number;
	delta_pct?: number;
}

// ── Active Filters ────────────────────────────────────────────────────────────
export interface DimensionFilter {
	dimension: string;
	value: string;
}

// ── Schema Preview ────────────────────────────────────────────────────────────
export interface ColumnSchema {
	name: string;
	type: string;
}

export interface SchemaPreview {
	tableName: string;
	columns: ColumnSchema[];
	rowCount: number;
	sampleRows: Record<string, unknown>[];
}
