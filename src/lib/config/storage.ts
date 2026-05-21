import type { AnyConfig } from '$lib/types';

const STORAGE_KEY = 'ducklens_config';

/**
 * Persist an array of configs to localStorage as JSON.
 */
export function saveConfig(configs: AnyConfig[]): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

/**
 * Load configs from localStorage.
 * Returns null if nothing is stored or if the stored value is corrupt.
 */
export function loadConfig(): AnyConfig[] | null {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === null) {
		return null;
	}
	try {
		return JSON.parse(raw) as AnyConfig[];
	} catch {
		return null;
	}
}

/**
 * Remove the stored config from localStorage.
 */
export function clearConfig(): void {
	localStorage.removeItem(STORAGE_KEY);
}
