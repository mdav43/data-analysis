<script lang="ts">
	import { onMount } from 'svelte';
	import { initDuckDB, query, registerFileBuffer, isDuckDBReady } from '$lib/duck/index.js';
	import EChart from '$lib/charts/EChart.svelte';
	import ConnectData from '$lib/wizards/ConnectData.svelte';
	import type { EChartsOption } from 'echarts';

	let bootStatus: 'idle' | 'booting' | 'ready' | 'error' = 'idle';
	let bootError = '';
	let orderCount = 0;
	let chartOption: EChartsOption | null = null;

	onMount(async () => {
		bootStatus = 'booting';
		try {
			await initDuckDB();

			// Fetch and register the bundled sample CSV
			const response = await fetch('/sample_orders.csv');
			const arrayBuffer = await response.arrayBuffer();
			await registerFileBuffer('sample_orders.csv', new Uint8Array(arrayBuffer));

			// Create table from the registered CSV
			await query(
				`CREATE TABLE IF NOT EXISTS sample_orders AS SELECT * FROM read_csv_auto('sample_orders.csv')`
			);

			// Run the tracer-bullet query
			const rows = await query<{ cnt: number | bigint }>('SELECT count(*) as cnt FROM sample_orders');
			orderCount = Number(rows[0]?.cnt ?? 0);

			chartOption = {
				title: { text: 'Sample Orders', left: 'center' },
				tooltip: {},
				xAxis: { type: 'category', data: ['sample_orders'] },
				yAxis: { type: 'value', name: 'Row Count' },
				series: [
					{
						type: 'bar',
						data: [orderCount],
						itemStyle: { color: '#4f8ef7' },
						label: { show: true, position: 'top' }
					}
				]
			};

			bootStatus = 'ready';
		} catch (e) {
			bootError = String(e);
			bootStatus = 'error';
			console.error('DuckDB boot error:', e);
		}
	});
</script>

<main class="app">
	<header>
		<h1>DuckLens</h1>
	</header>

	{#if bootStatus === 'idle' || bootStatus === 'booting'}
		<div class="boot-indicator" role="status" aria-live="polite">
			<div class="spinner"></div>
			<p>Initializing DuckDB WASM…</p>
		</div>
	{:else if bootStatus === 'error'}
		<div class="error-box">
			<strong>DuckDB failed to initialize</strong>
			<pre>{bootError}</pre>
		</div>
	{:else if bootStatus === 'ready'}
		<section class="chart-section">
			<h2>Row count: <span class="count">{orderCount.toLocaleString()}</span></h2>
			<div class="chart-container">
				{#if chartOption}
					<EChart option={chartOption} />
				{/if}
			</div>
		</section>
	{/if}

	<section class="connect-section">
		<h2>Connect Data</h2>
		<ConnectData />
	</section>
</main>

<style>
	.app {
		font-family: system-ui, -apple-system, sans-serif;
		max-width: 960px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	header h1 {
		font-size: 2rem;
		margin-bottom: 1rem;
		color: #1a1a2e;
	}

	.boot-indicator {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1.5rem;
		background: #f0f4ff;
		border-radius: 8px;
		color: #4f5b7a;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 3px solid #c0caff;
		border-top-color: #4f8ef7;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.error-box {
		padding: 1rem;
		background: #fff0f0;
		border: 1px solid #ffaaaa;
		border-radius: 6px;
		color: #c0392b;
	}

	.error-box pre {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		white-space: pre-wrap;
		word-break: break-all;
	}

	.chart-section {
		margin-bottom: 2rem;
	}

	.chart-section h2 {
		font-size: 1.1rem;
		color: #555;
		margin-bottom: 0.5rem;
	}

	.count {
		font-weight: 700;
		color: #4f8ef7;
	}

	.chart-container {
		width: 100%;
		height: 320px;
		border: 1px solid #e8eaf0;
		border-radius: 8px;
		overflow: hidden;
	}

	.connect-section {
		margin-top: 2rem;
	}

	.connect-section h2 {
		font-size: 1.3rem;
		margin-bottom: 0.75rem;
		color: #1a1a2e;
	}
</style>
