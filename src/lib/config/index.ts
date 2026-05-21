import * as yaml from 'js-yaml';
import type { AnyConfig, SourceConfig, ModelConfig, DashboardConfig } from '$lib/types';

// ── ConfigValidationError ────────────────────────────────────────────────────

export class ConfigValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigValidationError';
	}
}

// ── Internal validators ───────────────────────────────────────────────────────

function assertField(obj: Record<string, unknown>, field: string, kind: string): void {
	if (obj[field] === undefined || obj[field] === null) {
		throw new ConfigValidationError(
			`Config of kind '${kind}' is missing required field '${field}'`
		);
	}
}

function validateSource(raw: Record<string, unknown>): SourceConfig {
	assertField(raw, 'name', 'source');
	assertField(raw, 'type', 'source');
	assertField(raw, 'file', 'source');

	const validTypes = ['csv', 'duckdb'];
	if (!validTypes.includes(raw.type as string)) {
		throw new ConfigValidationError(
			`SourceConfig 'type' must be one of [${validTypes.join(', ')}], got '${raw.type}'`
		);
	}

	return raw as unknown as SourceConfig;
}

function validateModel(raw: Record<string, unknown>): ModelConfig {
	assertField(raw, 'name', 'model');
	assertField(raw, 'sql', 'model');
	assertField(raw, 'materialize', 'model');

	const validMaterialize = ['view', 'table'];
	if (!validMaterialize.includes(raw.materialize as string)) {
		throw new ConfigValidationError(
			`ModelConfig 'materialize' must be one of [${validMaterialize.join(', ')}], got '${raw.materialize}'`
		);
	}

	return raw as unknown as ModelConfig;
}

function validateDashboard(raw: Record<string, unknown>): DashboardConfig {
	const requiredFields = [
		'name',
		'model',
		'timeseries',
		'default_time_range',
		'default_grain',
		'dimensions',
		'measures',
		'layout'
	];
	for (const field of requiredFields) {
		assertField(raw, field, 'dashboard');
	}

	const validGrains = ['hour', 'day', 'week', 'month', 'quarter', 'year'];
	if (!validGrains.includes(raw.default_grain as string)) {
		throw new ConfigValidationError(
			`DashboardConfig 'default_grain' must be one of [${validGrains.join(', ')}], got '${raw.default_grain}'`
		);
	}

	return raw as unknown as DashboardConfig;
}

// ── parseConfig ───────────────────────────────────────────────────────────────

/**
 * Parse a single plain object into the correct typed AnyConfig.
 * Throws ConfigValidationError for invalid input.
 */
export function parseConfig(raw: unknown): AnyConfig {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new ConfigValidationError(
			`Config must be a plain object, got ${raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw}`
		);
	}

	const obj = raw as Record<string, unknown>;

	if (!('kind' in obj) || obj.kind === undefined || obj.kind === null) {
		throw new ConfigValidationError(
			`Config is missing required field 'kind'. Must be one of 'source', 'model', 'dashboard'`
		);
	}

	switch (obj.kind) {
		case 'source':
			return validateSource(obj);
		case 'model':
			return validateModel(obj);
		case 'dashboard':
			return validateDashboard(obj);
		default:
			throw new ConfigValidationError(
				`Unknown kind '${obj.kind}'. Must be one of 'source', 'model', 'dashboard'`
			);
	}
}

// ── serializeConfig ───────────────────────────────────────────────────────────

/**
 * Serialize an array of configs to a YAML string.
 * Multiple documents are separated by '---'.
 */
export function serializeConfig(configs: AnyConfig[]): string {
	if (configs.length === 0) {
		return '';
	}
	return configs.map((c) => yaml.dump(c)).join('---\n');
}

// ── importConfigYaml ──────────────────────────────────────────────────────────

/**
 * Parse a YAML string (potentially multi-doc) into AnyConfig[].
 * Throws ConfigValidationError if any document fails validation.
 */
export function importConfigYaml(yamlStr: string): AnyConfig[] {
	const docs: unknown[] = [];
	yaml.loadAll(yamlStr, (doc) => {
		if (doc !== null && doc !== undefined) {
			docs.push(doc);
		}
	});

	return docs.map((doc) => parseConfig(doc));
}

// ── exportConfigYaml ──────────────────────────────────────────────────────────

/**
 * Export an array of configs to a YAML string.
 * Alias for serializeConfig for a symmetric API with importConfigYaml.
 */
export function exportConfigYaml(configs: AnyConfig[]): string {
	return serializeConfig(configs);
}
