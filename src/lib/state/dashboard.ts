import { writable } from 'svelte/store';
import type { TimeRange, TimeGrain, DimensionFilter } from '$lib/types';

// Placeholder — always overwritten by fetchDataTimeRange before the dashboard renders.
export const activeRange = writable<TimeRange>({ start: new Date(0), end: new Date(0) });
export const activeGrain = writable<TimeGrain>('day');
export const activeFilters = writable<DimensionFilter[]>([]);
export const activeMeasure = writable<string>('');
export const comparisonEnabled = writable<boolean>(false);
