<script lang="ts">
	import type { TimeseriesRow, MeasureFormat } from '$lib/types';
	import type { EChartsOption } from 'echarts';
	import EChart from '$lib/charts/EChart.svelte';

	export let rows: TimeseriesRow[] = [];
	export let comparisonRows: TimeseriesRow[] = [];
	export let label = 'Value';
	export let loading = false;
	export let error: string | null = null;

	$: option = buildOption(rows, comparisonRows, label);

	function buildOption(
		primary: TimeseriesRow[],
		comparison: TimeseriesRow[],
		seriesLabel: string
	): EChartsOption {
		const series: EChartsOption['series'] = [
			{
				name: seriesLabel,
				type: 'line',
				data: primary.map((r) => [r.bucket, r.value]),
				smooth: true,
				itemStyle: { color: '#4f8ef7' },
				areaStyle: { opacity: 0.08, color: '#4f8ef7' }
			} as EChartsOption['series'] & object
		];

		if (comparison.length > 0) {
			(series as unknown[]).push({
				name: 'Prior period',
				type: 'line',
				data: comparison.map((r) => [r.bucket, r.value]),
				smooth: true,
				lineStyle: { type: 'dashed', color: '#aaa' },
				itemStyle: { color: '#aaa' }
			});
		}

		return {
			tooltip: { trigger: 'axis' },
			legend: comparison.length > 0 ? { bottom: 0 } : { show: false },
			grid: {
				left: 64,
				right: 20,
				top: 16,
				bottom: comparison.length > 0 ? 48 : 16
			},
			xAxis: { type: 'time' },
			yAxis: { type: 'value' },
			series
		};
	}
</script>

{#if loading}
	<div class="state-msg">Loading chart…</div>
{:else if error}
	<div class="state-msg error">{error}</div>
{:else if rows.length === 0}
	<div class="state-msg">No data for this period</div>
{:else}
	<EChart {option} />
{/if}

<style>
	.state-msg {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #bbb;
		font-size: 0.9rem;
	}
	.state-msg.error {
		color: #dc2626;
	}
</style>
