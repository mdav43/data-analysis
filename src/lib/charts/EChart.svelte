<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as echarts from 'echarts';

	/** ECharts option object — pass any valid ECharts configuration. */
	export let option: echarts.EChartsOption;

	let container: HTMLDivElement;
	let chart: echarts.ECharts | null = null;

	onMount(() => {
		chart = echarts.init(container);
		chart.setOption(option);

		const handleResize = () => chart?.resize();
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	// Re-render whenever option changes
	$: if (chart && option) {
		chart.setOption(option, { notMerge: true });
	}

	onDestroy(() => {
		chart?.dispose();
		chart = null;
	});
</script>

<div bind:this={container} style="width:100%; height:100%;"></div>
