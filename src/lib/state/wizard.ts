import { writable, derived, get } from 'svelte/store';
import type { AnyConfig, SourceConfig, ModelConfig, DashboardConfig } from '$lib/types';
import { exportConfigYaml, importConfigYaml } from '$lib/config/index';
import { saveConfig, loadConfig } from '$lib/config/storage';

export type WizardStep = 'connect' | 'model' | 'metrics' | 'dashboard' | 'done';

export const wizardStep = writable<WizardStep>('connect');
export const sources = writable<SourceConfig[]>([]);
export const models = writable<ModelConfig[]>([]);
export const dashboards = writable<DashboardConfig[]>([]);
export const yamlError = writable<string | null>(null);

export const allConfigs = derived(
	[sources, models, dashboards],
	([$sources, $models, $dashboards]): AnyConfig[] => [...$sources, ...$models, ...$dashboards]
);

export const configYaml = derived(allConfigs, ($configs) =>
	$configs.length > 0 ? exportConfigYaml($configs) : ''
);

function applyParsed(configs: AnyConfig[]): void {
	sources.set(configs.filter((c): c is SourceConfig => c.kind === 'source'));
	models.set(configs.filter((c): c is ModelConfig => c.kind === 'model'));
	dashboards.set(configs.filter((c): c is DashboardConfig => c.kind === 'dashboard'));
	saveConfig(configs);
}

export function applyYaml(text: string): boolean {
	try {
		const configs = importConfigYaml(text);
		applyParsed(configs);
		yamlError.set(null);
		return true;
	} catch (e) {
		yamlError.set(String(e));
		return false;
	}
}

export function addSource(source: SourceConfig): void {
	sources.update((s) => [...s.filter((x) => x.name !== source.name), source]);
	saveConfig(get(allConfigs));
}

export function setModel(model: ModelConfig): void {
	models.set([model]);
	saveConfig(get(allConfigs));
}

export function setDashboard(dashboard: DashboardConfig): void {
	dashboards.set([dashboard]);
	saveConfig(get(allConfigs));
}

export function loadPersistedConfig(): void {
	const configs = loadConfig();
	if (!configs || configs.length === 0) return;
	applyParsed(configs);
	if (configs.some((c) => c.kind === 'dashboard')) {
		wizardStep.set('done');
	}
}
