<script lang="ts">
	import { onMount } from 'svelte';
	import { initDuckDB, query, registerFileBuffer } from '$lib/duck/index.js';
	import { buildCreateViewSQL } from '$lib/query/model';
	import { buildTotalsSQL } from '$lib/query/totals';
	import { buildTimeseriesSQL } from '$lib/query/timeseries';
	import { buildLeaderboardSQL } from '$lib/query/leaderboard';
	import { buildComparisonRange, calculateDelta } from '$lib/query/comparison';
	import { resolveTimeRange } from '$lib/query/timerange';
	import { wizardStep, sources, models, dashboards, addSource, setModel, setDashboard, loadPersistedConfig } from '$lib/state/wizard';
	import { activeRange, activeGrain, activeFilters, comparisonEnabled } from '$lib/state/dashboard';

	import ConnectData from '$lib/wizards/ConnectData.svelte';
	import ModelWizard from '$lib/wizards/ModelWizard.svelte';
	import MetricsWizard from '$lib/wizards/MetricsWizard.svelte';
	import DashboardWizard from '$lib/wizards/DashboardWizard.svelte';
	import YAMLEditor from '$lib/wizards/YAMLEditor.svelte';
	import MetricCard from '$lib/components/MetricCard.svelte';
	import TimeseriesChart from '$lib/components/TimeseriesChart.svelte';
	import Leaderboard from '$lib/components/Leaderboard.svelte';
	import FilterChips from '$lib/components/FilterChips.svelte';

	import type { DashboardConfig, TimeseriesRow, LeaderboardRow, DimensionFilter, TimeGrain, TimeRangePreset } from '$lib/types';

	// ── Boot ─────────────────────────────────────────────────────────────────────

	let bootStatus: 'idle' | 'booting' | 'ready' | 'error' = 'idle';
	let bootError = '';
	let yamlOpen = false;

	// Sample CSV files that live under /static and can be re-fetched on reload.
	const SAMPLE_FILES = new Set(['sample_orders.csv', 'sample_customers.csv']);

	onMount(async () => {
		bootStatus = 'booting';
		try {
			await initDuckDB();
			loadPersistedConfig();
			// If persisted config has a model, recreate source tables then the view.
			// Source tables are lost when the DuckDB WASM instance is reset (e.g. page
			// refresh), so we re-fetch any built-in sample files and recreate their
			// tables before building the view.
			const model = $models[0];
			if (model) {
				for (const src of $sources) {
					if (!SAMPLE_FILES.has(src.file)) continue;
					const res = await fetch(`/${src.file}`);
					const buf = await res.arrayBuffer();
					await registerFileBuffer(src.file, new Uint8Array(buf));
					await query(
						`CREATE OR REPLACE TABLE ${src.name} AS SELECT * FROM read_csv_auto('${src.file}')`
					);
				}
				await query(buildCreateViewSQL(model.name, model.sql)).catch(() => {});
			}
			bootStatus = 'ready';
		} catch (e) {
			bootError = String(e);
			bootStatus = 'error';
		}
	});

	// ── Sample data shortcut ─────────────────────────────────────────────────────

	let sampleLoading = false;
	let sampleError = '';

	async function loadSampleData() {
		sampleLoading = true;
		sampleError = '';
		try {
			const [ordersRes, customersRes] = await Promise.all([
				fetch('/sample_orders.csv'),
				fetch('/sample_customers.csv')
			]);
			const [ordersBuffer, customersBuffer] = await Promise.all([
				ordersRes.arrayBuffer(),
				customersRes.arrayBuffer()
			]);
			await registerFileBuffer('sample_orders.csv', new Uint8Array(ordersBuffer));
			await registerFileBuffer('sample_customers.csv', new Uint8Array(customersBuffer));
			await query(`CREATE OR REPLACE TABLE sample_orders AS SELECT * FROM read_csv_auto('sample_orders.csv')`);
			await query(`CREATE OR REPLACE TABLE sample_customers AS SELECT * FROM read_csv_auto('sample_customers.csv')`);

			const modelSQL = `SELECT o.order_id, o.customer_id, o.product_id, o.ordered_at, o.amount, c.name, c.country, c.segment\nFROM sample_orders o\nLEFT JOIN sample_customers c ON o.customer_id = c.customer_id`;
			await query(`CREATE OR REPLACE VIEW orders_enriched AS\n${modelSQL}`);

			addSource({ kind: 'source', name: 'sample_orders', type: 'csv', file: 'sample_orders.csv' });
			addSource({ kind: 'source', name: 'sample_customers', type: 'csv', file: 'sample_customers.csv' });
			setModel({ kind: 'model', name: 'orders_enriched', sql: modelSQL, materialize: 'view' });
			setDashboard({
				kind: 'dashboard',
				name: 'Sales Dashboard',
				model: 'orders_enriched',
				timeseries: 'ordered_at',
				default_time_range: 'P365D',
				default_grain: 'month',
				comparison: { enabled: false, mode: 'previous_period' },
				dimensions: [
					{ name: 'country', column: 'country' },
					{ name: 'segment', column: 'segment' }
				],
				measures: [
					{ name: 'total_revenue', label: 'Total Revenue', expr: 'SUM(amount)', format: 'usd' },
					{ name: 'order_count', label: 'Orders', expr: 'COUNT(*)', format: 'number' }
				],
				layout: {
					metric_cards: ['total_revenue', 'order_count'],
					timeseries_measure: 'total_revenue',
					leaderboard_dimensions: ['country', 'segment']
				}
			});
			activeRange.set(resolveTimeRange('P365D'));
			activeGrain.set('month');
			wizardStep.set('done');
		} catch (e) {
			sampleError = String(e);
		} finally {
			sampleLoading = false;
		}
	}

	// ── Dashboard query state ────────────────────────────────────────────────────

	interface MetricResult {
		value: number;
		delta: number | null;
		deltaPct: number | null;
		loading: boolean;
		error: string | null;
	}

	let metricResults: Record<string, MetricResult> = {};
	let chartRows: TimeseriesRow[] = [];
	let chartCompRows: TimeseriesRow[] = [];
	let chartLoading = false;
	let chartError: string | null = null;
	let leaderboardResults: Record<string, { rows: LeaderboardRow[]; loading: boolean; error: string | null }> = {};

	let querySeq = 0;

	$: if (bootStatus === 'ready' && $wizardStep === 'done') {
		const d = $dashboards[0];
		if (d) runDashboard(d, $activeRange, $activeGrain, $activeFilters, $comparisonEnabled);
	}

	async function runDashboard(
		d: DashboardConfig,
		range: { start: Date; end: Date },
		grain: TimeGrain,
		filters: DimensionFilter[],
		comparison: boolean
	) {
		const seq = ++querySeq;
		const compRange = comparison ? buildComparisonRange(range) : null;

		// Metric cards
		for (const metricName of d.layout.metric_cards) {
			const measure = d.measures.find((m) => m.name === metricName);
			if (!measure || seq !== querySeq) continue;
			metricResults = {
				...metricResults,
				[metricName]: { value: 0, delta: null, deltaPct: null, loading: true, error: null }
			};
			try {
				const sql = buildTotalsSQL({ measure, model: d.model, range, filters, timeseries: d.timeseries });
				const rows = await query<{ value: number }>(sql);
				if (seq !== querySeq) return;
				const curr = Number(rows[0]?.value ?? 0);
				let delta: number | null = null;
				let deltaPct: number | null = null;
				if (compRange) {
					const compSQL = buildTotalsSQL({ measure, model: d.model, range: compRange, filters, timeseries: d.timeseries });
					const compRows = await query<{ value: number }>(compSQL);
					if (seq !== querySeq) return;
					const prev = Number(compRows[0]?.value ?? 0);
					const dr = calculateDelta(curr, prev);
					delta = dr.absolute;
					deltaPct = dr.pct;
				}
				metricResults = {
					...metricResults,
					[metricName]: { value: curr, delta, deltaPct, loading: false, error: null }
				};
			} catch (e) {
				if (seq !== querySeq) return;
				metricResults = {
					...metricResults,
					[metricName]: { value: 0, delta: null, deltaPct: null, loading: false, error: String(e) }
				};
			}
		}

		// Timeseries
		if (seq !== querySeq) return;
		const tsMeasure = d.measures.find((m) => m.name === d.layout.timeseries_measure);
		if (tsMeasure) {
			chartLoading = true;
			chartError = null;
			try {
				const sql = buildTimeseriesSQL({ measure: tsMeasure, model: d.model, grain, range, timeseries: d.timeseries, filters });
				const rows = await query<TimeseriesRow>(sql);
				if (seq !== querySeq) return;
				let compRows: TimeseriesRow[] = [];
				if (compRange) {
					const compSQL = buildTimeseriesSQL({ measure: tsMeasure, model: d.model, grain, range: compRange, timeseries: d.timeseries, filters });
					compRows = await query<TimeseriesRow>(compSQL);
				}
				if (seq !== querySeq) return;
				chartRows = rows;
				chartCompRows = compRows;
				chartLoading = false;
			} catch (e) {
				if (seq !== querySeq) return;
				chartRows = [];
				chartCompRows = [];
				chartLoading = false;
				chartError = String(e);
			}
		}

		// Leaderboards
		const activeMeasure = d.measures[0];
		for (const dimName of d.layout.leaderboard_dimensions) {
			const dim = d.dimensions.find((dx) => dx.name === dimName);
			if (!dim || !activeMeasure || seq !== querySeq) continue;
			leaderboardResults = {
				...leaderboardResults,
				[dimName]: { rows: [], loading: true, error: null }
			};
			try {
				const sql = buildLeaderboardSQL({
					measure: activeMeasure,
					model: d.model,
					dimension: dim.column,
					range,
					timeseries: d.timeseries,
					filters,
					topN: 10
				});
				const rawRows = await query<Record<string, unknown>>(sql);
				if (seq !== querySeq) return;
				let lbRows: LeaderboardRow[] = rawRows.map((r) => ({
					dimension_value: String(r[dim.column] ?? ''),
					value: Number(r['value'] ?? 0)
				}));
				if (compRange) {
					const compSQL = buildLeaderboardSQL({
						measure: activeMeasure,
						model: d.model,
						dimension: dim.column,
						range: compRange,
						timeseries: d.timeseries,
						filters,
						topN: 10
					});
					const compRaw = await query<Record<string, unknown>>(compSQL);
					if (seq !== querySeq) return;
					const compMap = new Map(compRaw.map((r) => [String(r[dim.column] ?? ''), Number(r['value'] ?? 0)]));
					lbRows = lbRows.map((row) => {
						const prev = compMap.get(row.dimension_value);
						if (prev != null) {
							const dr = calculateDelta(row.value, prev);
							return { ...row, delta: dr.absolute, delta_pct: dr.pct ?? undefined };
						}
						return row;
					});
				}
				leaderboardResults = { ...leaderboardResults, [dimName]: { rows: lbRows, loading: false, error: null } };
			} catch (e) {
				if (seq !== querySeq) return;
				leaderboardResults = { ...leaderboardResults, [dimName]: { rows: [], loading: false, error: String(e) } };
			}
		}
	}

	// ── Raw data ─────────────────────────────────────────────────────────────────

	let rawDataOpen = false;
	let rawRows: Record<string, unknown>[] = [];
	let rawLoading = false;
	let rawError: string | null = null;
	let rawSeq = 0;

	function buildRawDataSQL(
		model: string,
		timeseries: string,
		range: { start: Date; end: Date },
		filters: DimensionFilter[],
		limit = 500
	): string {
		const conditions: string[] = [
			`${timeseries} >= '${range.start.toISOString()}'`,
			`${timeseries} < '${range.end.toISOString()}'`
		];
		for (const f of filters) {
			conditions.push(`${f.dimension} = '${f.value.replace(/'/g, "''")}'`);
		}
		return `SELECT * FROM ${model}\nWHERE ${conditions.join('\n  AND ')}\nORDER BY ${timeseries} DESC\nLIMIT ${limit}`;
	}

	async function fetchRawData(
		d: DashboardConfig,
		range: { start: Date; end: Date },
		filters: DimensionFilter[]
	) {
		const seq = ++rawSeq;
		rawLoading = true;
		rawError = null;
		try {
			const sql = buildRawDataSQL(d.model, d.timeseries, range, filters);
			const rows = await query<Record<string, unknown>>(sql);
			if (seq !== rawSeq) return;
			rawRows = rows;
		} catch (e) {
			if (seq !== rawSeq) return;
			rawError = String(e);
			rawRows = [];
		} finally {
			if (seq === rawSeq) rawLoading = false;
		}
	}

	$: if (rawDataOpen && bootStatus === 'ready' && dashboard) {
		fetchRawData(dashboard, $activeRange, $activeFilters);
	}

	// ── Filter management ────────────────────────────────────────────────────────

	function addFilter(dimension: string, value: string) {
		activeFilters.update((f) =>
			f.some((x) => x.dimension === dimension && x.value === value)
				? f
				: [...f, { dimension, value }]
		);
	}

	function removeFilter(f: DimensionFilter) {
		activeFilters.update((fs) =>
			fs.filter((x) => !(x.dimension === f.dimension && x.value === f.value))
		);
	}

	// ── Time range UI ────────────────────────────────────────────────────────────

	const PRESETS: { label: string; value: TimeRangePreset }[] = [
		{ label: 'Last 7 days', value: 'P7D' },
		{ label: 'Last 30 days', value: 'P30D' },
		{ label: 'Last 90 days', value: 'P90D' },
		{ label: 'Last 365 days', value: 'P365D' }
	];

	let rangePreset: TimeRangePreset = 'P365D';

	function handleRangeChange(preset: string) {
		rangePreset = preset as TimeRangePreset;
		activeRange.set(resolveTimeRange(preset as TimeRangePreset));
	}

	// ── Connect handler ──────────────────────────────────────────────────────────

	function handleConnect(e: CustomEvent<import('$lib/types').SourceConfig>) {
		addSource(e.detail);
	}

	// ── Wizard step helpers ──────────────────────────────────────────────────────

	const STEP_LABELS: Record<string, string> = {
		connect: 'Connect',
		model: 'Model',
		metrics: 'Metrics',
		dashboard: 'Dashboard'
	};
	const STEP_ORDER = ['connect', 'model', 'metrics', 'dashboard'];

	function stepDone(step: string): boolean {
		const idx = STEP_ORDER.indexOf(step);
		const cur = STEP_ORDER.indexOf($wizardStep);
		return cur > idx;
	}

	$: dashboard = $dashboards[0];
</script>

<!-- ── Boot screen ─────────────────────────────────────────────────────────── -->
{#if bootStatus === 'idle' || bootStatus === 'booting'}
	<div class="boot-screen">
		<div class="spinner-lg"></div>
		<p>Initializing DuckDB WASM…</p>
	</div>
{:else if bootStatus === 'error'}
	<div class="boot-screen error">
		<h2>Failed to initialize</h2>
		<pre>{bootError}</pre>
	</div>

<!-- ── Wizard ─────────────────────────────────────────────────────────────── -->
{:else if $wizardStep !== 'done'}
	<div class="app">
		<header class="app-header">
			<span class="logo">DuckLens</span>
			<button class="btn-ghost" on:click={() => (yamlOpen = !yamlOpen)}>
				{yamlOpen ? 'Hide YAML' : 'Show YAML'}
			</button>
		</header>

		<div class="wizard-body">
			<!-- Step progress -->
			<nav class="step-nav" aria-label="Wizard steps">
				{#each STEP_ORDER as step}
					<div
						class="step-item"
						class:active={$wizardStep === step}
						class:done={stepDone(step)}
					>
						<span class="step-dot"></span>
						<span class="step-label">{STEP_LABELS[step]}</span>
					</div>
				{/each}
			</nav>

			<!-- Active wizard panel -->
			<div class="wizard-panel">
				{#if $wizardStep === 'connect'}
					<div class="wizard-step">
						<h2>1. Connect Data</h2>
						<p class="subtitle">Upload your data or try the built-in sample dataset.</p>

						<div class="sample-box">
							<p>Zero-setup demo with sample orders + customers data:</p>
							<button class="btn-sample" on:click={loadSampleData} disabled={sampleLoading}>
								{sampleLoading ? 'Loading…' : '⚡ Load sample data'}
							</button>
							{#if sampleError}
								<div class="error-inline">{sampleError}</div>
							{/if}
						</div>

						<div class="divider">— or upload your own CSV —</div>

						<ConnectData on:connect={handleConnect} />

						{#if $sources.length > 0}
							<div class="connected-list">
								{#each $sources as s}
									<div class="connected-item">✓ {s.name}</div>
								{/each}
							</div>
							<div class="wizard-actions">
								<button class="btn-primary" on:click={() => wizardStep.set('model')}>
									Next →
								</button>
							</div>
						{/if}
					</div>
				{:else if $wizardStep === 'model'}
					<ModelWizard />
				{:else if $wizardStep === 'metrics'}
					<MetricsWizard />
				{:else if $wizardStep === 'dashboard'}
					<DashboardWizard />
				{/if}
			</div>

			<!-- YAML sidebar -->
			{#if yamlOpen}
				<div class="yaml-sidebar">
					<YAMLEditor />
				</div>
			{/if}
		</div>
	</div>

<!-- ── Dashboard ──────────────────────────────────────────────────────────── -->
{:else if dashboard}
	<div class="app">
		<header class="app-header dashboard-header">
			<span class="logo">{dashboard.name}</span>
			<div class="header-controls">
				<!-- Time range -->
				<select
					value={rangePreset}
					on:change={(e) => handleRangeChange(e.currentTarget.value)}
					aria-label="Time range"
				>
					{#each PRESETS as p}
						<option value={p.value}>{p.label}</option>
					{/each}
				</select>

				<!-- Grain -->
				<select bind:value={$activeGrain} aria-label="Grain">
					<option value="hour">Hour</option>
					<option value="day">Day</option>
					<option value="week">Week</option>
					<option value="month">Month</option>
					<option value="quarter">Quarter</option>
					<option value="year">Year</option>
				</select>

				<!-- Comparison toggle -->
				<label class="comparison-toggle">
					<input type="checkbox" bind:checked={$comparisonEnabled} />
					Compare
				</label>

				<!-- Raw data toggle -->
				<button class="btn-ghost" on:click={() => (rawDataOpen = !rawDataOpen)}>
					{rawDataOpen ? 'Hide data' : 'Raw data'}
				</button>

				<!-- YAML toggle -->
				<button class="btn-ghost" on:click={() => (yamlOpen = !yamlOpen)}>
					{yamlOpen ? 'Hide YAML' : 'YAML'}
				</button>

				<!-- Back to wizard -->
				<button class="btn-ghost" on:click={() => wizardStep.set('connect')}>
					Edit config
				</button>
			</div>
		</header>

		<!-- YAML editor overlay -->
		{#if yamlOpen}
			<div class="yaml-overlay">
				<YAMLEditor />
			</div>
		{/if}

		<main class="dashboard-body">
			<!-- Filter chips -->
			{#if $activeFilters.length > 0}
				<div class="filter-bar">
					<FilterChips
						filters={$activeFilters}
						on:remove={(e) => removeFilter(e.detail)}
						on:clear={() => activeFilters.set([])}
					/>
				</div>
			{/if}

			<!-- Metric cards -->
			{#if dashboard.layout.metric_cards.length > 0}
				<div class="metric-cards">
					{#each dashboard.layout.metric_cards as metricName}
						{@const measure = dashboard.measures.find((m) => m.name === metricName)}
						{@const result = metricResults[metricName]}
						<MetricCard
							label={measure?.label ?? metricName}
							value={result?.value ?? null}
							format={measure?.format ?? 'number'}
							delta={$comparisonEnabled ? (result?.delta ?? null) : null}
							deltaPct={$comparisonEnabled ? (result?.deltaPct ?? null) : null}
							loading={result?.loading ?? true}
							error={result?.error ?? null}
						/>
					{/each}
				</div>
			{/if}

			<!-- Timeseries chart -->
			<div class="chart-container">
				<TimeseriesChart
					rows={chartRows}
					comparisonRows={$comparisonEnabled ? chartCompRows : []}
					label={dashboard.measures.find((m) => m.name === dashboard.layout.timeseries_measure)?.label ?? ''}
					loading={chartLoading}
					error={chartError}
				/>
			</div>

			<!-- Leaderboards -->
			{#if dashboard.layout.leaderboard_dimensions.length > 0}
				<div class="leaderboards">
					{#each dashboard.layout.leaderboard_dimensions as dimName}
						{@const dim = dashboard.dimensions.find((d) => d.name === dimName)}
						{@const measure = dashboard.measures[0]}
						<Leaderboard
							title={dimName}
							dimension={dim?.column ?? dimName}
							rows={leaderboardResults[dimName]?.rows ?? []}
							format={measure?.format ?? 'number'}
							comparisonEnabled={$comparisonEnabled}
							loading={leaderboardResults[dimName]?.loading ?? true}
							error={leaderboardResults[dimName]?.error ?? null}
							on:filter={(e) => addFilter(e.detail.dimension, e.detail.value)}
						/>
					{/each}
				</div>
			{/if}

			<!-- Raw data table -->
			{#if rawDataOpen}
				<div class="raw-data-section">
					<div class="raw-data-header">
						<h3>Raw data</h3>
						{#if !rawLoading && !rawError}
							<span class="raw-data-count">
								{rawRows.length}{rawRows.length === 500 ? ' rows (limit 500)' : ' rows'}
							</span>
						{/if}
					</div>
					{#if rawLoading}
						<div class="raw-status">Loading…</div>
					{:else if rawError}
						<div class="raw-status raw-error">{rawError}</div>
					{:else if rawRows.length === 0}
						<div class="raw-status">No rows match the current filters and time range.</div>
					{:else}
						{@const columns = Object.keys(rawRows[0])}
						<div class="raw-table-wrap">
							<table class="raw-table">
								<thead>
									<tr>
										{#each columns as col}
											<th>{col}</th>
										{/each}
									</tr>
								</thead>
								<tbody>
									{#each rawRows as row}
										<tr>
											{#each columns as col}
												<td title={String(row[col] ?? '')}>{row[col] ?? ''}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}
		</main>
	</div>
{/if}

<style>
	/* ── Global reset ──────────────────────────────────────────────────────── */
	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		font-family: system-ui, -apple-system, sans-serif;
		background: #f5f7fc;
		color: #1a1a2e;
	}

	/* ── App shell ─────────────────────────────────────────────────────────── */
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.app-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.5rem;
		background: white;
		border-bottom: 1px solid #e8eaf0;
		flex-shrink: 0;
		gap: 1rem;
	}

	.logo {
		font-size: 1.1rem;
		font-weight: 700;
		color: #1a1a2e;
		letter-spacing: -0.02em;
	}

	/* ── Boot screen ───────────────────────────────────────────────────────── */
	.boot-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		gap: 1rem;
		color: #666;
	}

	.boot-screen.error {
		color: #dc2626;
	}

	.boot-screen pre {
		font-size: 0.8rem;
		background: #fff0f0;
		padding: 1rem;
		border-radius: 6px;
		max-width: 600px;
		overflow: auto;
	}

	.spinner-lg {
		width: 40px;
		height: 40px;
		border: 4px solid #c0caff;
		border-top-color: #4f8ef7;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Wizard ────────────────────────────────────────────────────────────── */
	.wizard-body {
		display: flex;
		flex: 1;
		gap: 0;
		overflow: hidden;
	}

	.step-nav {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 1.5rem 1rem;
		background: white;
		border-right: 1px solid #e8eaf0;
		width: 140px;
		flex-shrink: 0;
	}

	.step-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.5rem;
		color: #bbb;
		font-size: 0.85rem;
		border-radius: 6px;
		transition: color 0.15s;
	}

	.step-item.active {
		color: #4f8ef7;
		font-weight: 600;
	}

	.step-item.done {
		color: #16a34a;
	}

	.step-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: currentColor;
		flex-shrink: 0;
	}

	.wizard-panel {
		flex: 1;
		padding: 2rem;
		overflow-y: auto;
	}

	.yaml-sidebar {
		width: 340px;
		flex-shrink: 0;
		border-left: 1px solid #e8eaf0;
		display: flex;
		flex-direction: column;
		padding: 0.75rem;
		background: white;
	}

	/* ── Connect step ──────────────────────────────────────────────────────── */
	.wizard-step {
		max-width: 560px;
	}

	.wizard-step h2 {
		margin: 0 0 0.25rem;
		font-size: 1.2rem;
	}

	.subtitle {
		margin: 0 0 1.5rem;
		color: #777;
		font-size: 0.9rem;
	}

	.sample-box {
		background: #f0f4ff;
		border: 1px solid #d0dcf7;
		border-radius: 8px;
		padding: 1rem 1.25rem;
		margin-bottom: 1.25rem;
	}

	.sample-box p {
		margin: 0 0 0.75rem;
		color: #444;
		font-size: 0.875rem;
	}

	.btn-sample {
		padding: 0.55rem 1.1rem;
		background: #4f8ef7;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 600;
	}
	.btn-sample:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-sample:hover:not(:disabled) {
		background: #3a7ae8;
	}

	.error-inline {
		margin-top: 0.5rem;
		font-size: 0.8rem;
		color: #dc2626;
	}

	.divider {
		text-align: center;
		color: #bbb;
		font-size: 0.8rem;
		margin: 1rem 0;
		position: relative;
	}

	.connected-list {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.connected-item {
		font-size: 0.875rem;
		color: #16a34a;
		font-weight: 500;
	}

	.wizard-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 1.25rem;
	}

	/* ── Shared button styles ─────────────────────────────────────────────── */
	:global(.btn-primary) {
		padding: 0.5rem 1.1rem;
		background: #4f8ef7;
		color: white;
		border: 1px solid #3a7ae8;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 600;
	}
	:global(.btn-primary:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}
	:global(.btn-primary:hover:not(:disabled)) {
		background: #3a7ae8;
	}

	:global(.btn-secondary) {
		padding: 0.5rem 1.1rem;
		background: white;
		color: #555;
		border: 1px solid #d8dce8;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
	}
	:global(.btn-secondary:hover) {
		background: #f5f5f5;
	}

	.btn-ghost {
		padding: 0.4rem 0.8rem;
		background: none;
		color: #666;
		border: 1px solid #d8dce8;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		white-space: nowrap;
	}
	.btn-ghost:hover {
		background: #f5f5f5;
	}

	/* ── Dashboard ─────────────────────────────────────────────────────────── */
	.dashboard-header {
		flex-wrap: wrap;
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.header-controls select {
		padding: 0.35rem 0.6rem;
		border: 1px solid #d8dce8;
		border-radius: 6px;
		font-size: 0.8rem;
		background: white;
		cursor: pointer;
	}

	.comparison-toggle {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #555;
		cursor: pointer;
	}

	.yaml-overlay {
		position: fixed;
		top: 56px;
		right: 0;
		width: 360px;
		height: calc(100vh - 56px);
		border-left: 1px solid #e8eaf0;
		background: white;
		z-index: 100;
		box-shadow: -4px 0 16px rgba(0, 0, 0, 0.08);
	}

	.dashboard-body {
		flex: 1;
		padding: 1.25rem 1.5rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.filter-bar {
		background: white;
		border: 1px solid #e8eaf0;
		border-radius: 8px;
		padding: 0.6rem 1rem;
	}

	.metric-cards {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.chart-container {
		background: white;
		border: 1px solid #e8eaf0;
		border-radius: 8px;
		height: 320px;
		overflow: hidden;
	}

	.leaderboards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
	}

	/* ── Raw data ──────────────────────────────────────────────────────────── */
	.raw-data-section {
		background: white;
		border: 1px solid #e8eaf0;
		border-radius: 8px;
		overflow: hidden;
	}

	.raw-data-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid #e8eaf0;
		background: #f8faff;
	}

	.raw-data-header h3 {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 700;
		color: #555;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.raw-data-count {
		font-size: 0.75rem;
		color: #999;
	}

	.raw-status {
		padding: 1.5rem;
		text-align: center;
		font-size: 0.85rem;
		color: #888;
	}

	.raw-status.raw-error {
		color: #dc2626;
	}

	.raw-table-wrap {
		overflow-x: auto;
		max-height: 420px;
		overflow-y: auto;
	}

	.raw-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.raw-table th {
		position: sticky;
		top: 0;
		background: #f5f7fc;
		padding: 0.45rem 0.75rem;
		text-align: left;
		font-weight: 600;
		color: #555;
		border-bottom: 1px solid #e8eaf0;
		white-space: nowrap;
		z-index: 1;
	}

	.raw-table td {
		padding: 0.35rem 0.75rem;
		border-bottom: 1px solid #f0f2f8;
		color: #333;
		white-space: nowrap;
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.raw-table tbody tr:hover {
		background: #f8faff;
	}

	/* ── Responsive ────────────────────────────────────────────────────────── */
	@media (max-width: 640px) {
		.step-nav {
			display: none;
		}

		.wizard-panel {
			padding: 1.25rem;
		}

		.yaml-sidebar {
			display: none;
		}

		.dashboard-body {
			padding: 0.75rem;
		}

		.yaml-overlay {
			width: 100vw;
		}
	}
</style>
