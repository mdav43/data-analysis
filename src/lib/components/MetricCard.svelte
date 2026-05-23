<script lang="ts">
	import type { MeasureFormat } from '$lib/types';
	import { formatMeasureValue } from '$lib/query/totals';

	export let label: string;
	export let value: number | null = null;
	export let format: MeasureFormat = 'number';
	export let delta: number | null = null;
	export let deltaPct: number | null = null;
	export let loading = false;
	export let error: string | null = null;

	$: formattedValue = value != null ? formatMeasureValue(value, format) : '—';
	$: deltaClass = delta != null ? (delta >= 0 ? 'up' : 'down') : '';
	$: formattedDelta =
		delta != null ? `${delta >= 0 ? '+' : ''}${formatMeasureValue(delta, format)}` : null;
	$: formattedDeltaPct =
		deltaPct != null ? `${deltaPct >= 0 ? '+' : ''}${(deltaPct * 100).toFixed(1)}%` : null;
</script>

<div class="dl-stat">
	<div class="dl-stat-label">{label}</div>
	{#if loading}
		<div class="dl-skeleton" style="height:34px;width:60%;"></div>
	{:else if error}
		<div class="error-msg">{error}</div>
	{:else}
		<div class="dl-stat-value">{formattedValue}</div>
		{#if formattedDelta != null}
			<div class="dl-stat-meta">
				<span class="dl-delta {deltaClass}">{formattedDelta}</span>
				{#if formattedDeltaPct}
					<span class="pct">{formattedDeltaPct}</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.error-msg {
		font-family: var(--font-mono);
		font-size: var(--fs-11);
		color: var(--danger-text);
	}

	.pct {
		color: var(--fg-subtle);
		font-size: var(--fs-10);
	}
</style>
