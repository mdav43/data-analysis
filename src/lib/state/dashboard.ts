import { writable } from 'svelte/store';
import type { TimeRange, TimeGrain, DimensionFilter } from '$lib/types';
import { resolveTimeRange } from '$lib/query/timerange';

export const activeRange = writable<TimeRange>(resolveTimeRange('P30D'));
export const activeGrain = writable<TimeGrain>('day');
export const activeFilters = writable<DimensionFilter[]>([]);
export const activeMeasure = writable<string>('');
export const comparisonEnabled = writable<boolean>(false);
