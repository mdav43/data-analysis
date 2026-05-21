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

<div class="metric-card">
	<div class="label">{label}</div>
	{#if loading}
		<div class="value skeleton"></div>
	{:else if error}
		<div class="error">{error}</div>
	{:else}
		<div class="value">{formattedValue}</div>
		{#if formattedDelta != null}
			<div class="delta {deltaClass}">
				{formattedDelta}
				{#if formattedDeltaPct}
					<span class="pct">({formattedDeltaPct})</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.metric-card {
		background: white;
		border: 1px solid #e8eaf0;
		border-radius: 8px;
		padding: 1.25rem 1.5rem;
		min-width: 140px;
	}

	.label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #999;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	.value {
		font-size: 1.75rem;
		font-weight: 700;
		color: #1a1a2e;
		line-height: 1.1;
	}

	.skeleton {
		height: 2rem;
		width: 70%;
		background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
		border-radius: 4px;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	.error {
		font-size: 0.8rem;
		color: #dc2626;
		margin-top: 0.25rem;
	}

	.delta {
		font-size: 0.8rem;
		font-weight: 600;
		margin-top: 0.4rem;
	}
	.delta.up {
		color: #16a34a;
	}
	.delta.down {
		color: #dc2626;
	}
	.pct {
		font-weight: normal;
		opacity: 0.85;
	}
</style>
