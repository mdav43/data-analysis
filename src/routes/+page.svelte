<script lang="ts">
	import { onMount } from 'svelte';
	import { initDuckDB, query, registerFileBuffer } from '$lib/duck/index.js';
	import { buildCreateViewSQL } from '$lib/query/model';
	import { buildTotalsSQL } from '$lib/query/totals';
	import { buildTimeseriesSQL } from '$lib/query/timeseries';
	import { buildLeaderboardSQL } from '$lib/query/leaderboard';
	import { buildComparisonRange, calculateDelta } from '$lib/query/comparison';
	import { resolveTimeRange, fetchDataTimeRange } from '$lib/query/timerange';
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

	import type { DashboardConfig, TimeseriesRow, LeaderboardRow, DimensionFilter, TimeGrain, TimeRange, TimeRangePreset } from '$lib/types';

	// ── Boot ─────────────────────────────────────────────────────────────────────

	let bootStatus: 'idle' | 'booting' | 'ready' | 'error' = 'idle';
	let bootError = '';
	let yamlOpen = false;
	let theme: 'light' | 'dark' = 'light';
	function toggleTheme() { theme = theme === 'light' ? 'dark' : 'light'; }

	// Sample CSV files that live under /static and can be re-fetched on reload.
	const SAMPLE_FILES = new Set(['sample_orders.csv', 'sample_customers.csv']);

	// The data-derived time extent; null until DuckDB is queried.
	let dataTimeRange: TimeRange | null = null;

	async function initializeDataRange(model: string, timeseries: string): Promise<void> {
		try {
			dataTimeRange = await fetchDataTimeRange(model, timeseries);
			rangePreset = 'ALL';
			activeRange.set(dataTimeRange);
		} catch {
			// Empty table or unavailable — fall back to a wide window
			dataTimeRange = null;
			rangePreset = 'P365D';
			activeRange.set(resolveTimeRange('P365D'));
		}
	}

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
				const dash = $dashboards[0];
				if (dash) {
					await initializeDataRange(dash.model, dash.timeseries);
					activeGrain.set(dash.default_grain ?? 'day');
				}
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
			await initializeDataRange('orders_enriched', 'ordered_at');
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
		{ label: 'All data', value: 'ALL' },
		{ label: 'Last 7 days', value: 'P7D' },
		{ label: 'Last 30 days', value: 'P30D' },
		{ label: 'Last 90 days', value: 'P90D' },
		{ label: 'Last 365 days', value: 'P365D' }
	];

	let rangePreset: TimeRangePreset = 'ALL';

	function handleRangeChange(preset: string) {
		rangePreset = preset as TimeRangePreset;
		if (preset === 'ALL') {
			if (dataTimeRange) activeRange.set(dataTimeRange);
		} else {
			// Resolve relative to the data's max date, not the current clock
			const anchor = dataTimeRange?.end;
			activeRange.set(resolveTimeRange(preset as Exclude<TimeRangePreset, 'ALL'>, anchor));
		}
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

<!-- ── Root wrapper (theme applied here) ───────────────────────────────────── -->
<div class="app theme-{theme}">

<!-- ── Boot screen ─────────────────────────────────────────────────────────── -->
{#if bootStatus === 'idle' || bootStatus === 'booting'}
	<div class="boot-screen">
		<div class="dl-spinner" style="width:32px;height:32px;border-width:2.5px;"></div>
		<p class="boot-msg">Initializing DuckDB WASM…</p>
	</div>
{:else if bootStatus === 'error'}
	<div class="boot-screen">
		<p class="boot-msg" style="color:var(--danger-text)">Failed to initialize</p>
		<pre class="boot-error">{bootError}</pre>
	</div>

<!-- ── Wizard ─────────────────────────────────────────────────────────────── -->
{:else if $wizardStep !== 'done'}
	<!-- Topbar -->
	<header class="dl-topbar">
		<div class="dl-logo">
			<span class="dl-logo-mark"></span>
			DuckLens
		</div>
		<div class="dl-vline" style="height:14px;"></div>
		<div class="dl-pathbar">
			<span>wizard</span>
			<span class="sep">/</span>
			<span class="here">{$wizardStep}</span>
		</div>
		<div class="dl-spacer"></div>
		<button class="dl-btn ghost sm" on:click={() => (yamlOpen = !yamlOpen)}>
			{yamlOpen ? 'hide yaml' : 'yaml'}
		</button>
		<button class="dl-btn ghost sm theme-toggle" on:click={toggleTheme} aria-label="Toggle theme">
			{theme === 'dark' ? '☀' : '☾'}
		</button>
	</header>

	<div class="wizard-body">
		<!-- Step sidebar -->
		<nav class="dl-sidebar" aria-label="Wizard steps">
			<div class="dl-sidebar-section">
				<div class="dl-sidebar-header">Pipeline</div>
				{#each STEP_ORDER as step, i}
					<div
						class="dl-nav-item"
						class:active={$wizardStep === step}
						class:done={stepDone(step)}
					>
						<span class="num">{String(i + 1).padStart(2, '0')}</span>
						<span>{STEP_LABELS[step]}</span>
						{#if stepDone(step)}
							<span style="margin-left:auto;color:var(--accent);font-size:10px;">✓</span>
						{/if}
					</div>
				{/each}
			</div>
		</nav>

		<!-- Active wizard panel -->
		<div class="wizard-panel">
			{#if $wizardStep === 'connect'}
				<div class="wizard-step">
					<div class="eyebrow" style="margin-bottom:var(--sp-3)">Step 01</div>
					<h2 class="step-heading">Connect Data</h2>
					<p class="step-sub">Upload your data or try the built-in sample dataset.</p>

					<div class="sample-box dl-panel">
						<div class="dl-panel-header">
							<span class="dl-panel-title">Quick start</span>
							<span class="dl-badge green">
								<span class="dl-dot green"></span>
								sample data
							</span>
						</div>
						<div class="dl-panel-body">
							<p class="sample-desc">Zero-setup demo with sample orders + customers data:</p>
							<button class="dl-btn primary" on:click={loadSampleData} disabled={sampleLoading}>
								{#if sampleLoading}
									<span class="dl-spinner"></span>
									Loading…
								{:else}
									⚡ Load sample data
								{/if}
							</button>
							{#if sampleError}
								<div class="inline-error">{sampleError}</div>
							{/if}
						</div>
					</div>

					<div class="or-divider">
						<span class="eyebrow">or upload your own csv</span>
					</div>

					<ConnectData on:connect={handleConnect} />

					{#if $sources.length > 0}
						<div class="connected-list">
							{#each $sources as s}
								<div class="connected-item">
									<span class="dl-dot green"></span>
									<span class="mono">{s.name}</span>
								</div>
							{/each}
						</div>
						<div class="wizard-actions">
							<button class="dl-btn primary lg" on:click={() => wizardStep.set('model')}>
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

<!-- ── Dashboard ──────────────────────────────────────────────────────────── -->
{:else if dashboard}
	<!-- Topbar -->
	<header class="dl-topbar">
		<div class="dl-logo">
			<span class="dl-logo-mark"></span>
			DuckLens
		</div>
		<div class="dl-vline" style="height:14px;"></div>
		<div class="dl-pathbar">
			<span>dashboard</span>
			<span class="sep">/</span>
			<span class="here mono">{dashboard.name}</span>
		</div>
		<div class="dl-spacer"></div>

		<!-- Time range -->
		<select
			class="dl-select"
			style="width:auto;"
			value={rangePreset}
			on:change={(e) => handleRangeChange(e.currentTarget.value)}
			aria-label="Time range"
		>
			{#each PRESETS as p}
				<option value={p.value}>{p.label}</option>
			{/each}
		</select>

		<!-- Grain -->
		<select class="dl-select" style="width:auto;" bind:value={$activeGrain} aria-label="Grain">
			<option value="hour">hour</option>
			<option value="day">day</option>
			<option value="week">week</option>
			<option value="month">month</option>
			<option value="quarter">quarter</option>
			<option value="year">year</option>
		</select>

		<!-- Comparison toggle -->
		<label class="compare-label">
			<input type="checkbox" bind:checked={$comparisonEnabled} />
			<span class="mono" style="font-size:var(--fs-11)">compare</span>
		</label>

		<div class="dl-vline" style="height:14px;"></div>

		<button class="dl-btn ghost sm" on:click={() => (rawDataOpen = !rawDataOpen)}>
			{rawDataOpen ? 'hide data' : 'raw data'}
		</button>
		<button class="dl-btn ghost sm" on:click={() => (yamlOpen = !yamlOpen)}>
			{yamlOpen ? 'hide yaml' : 'yaml'}
		</button>
		<button class="dl-btn sm" on:click={() => wizardStep.set('connect')}>
			edit config
		</button>
		<button class="dl-btn ghost sm theme-toggle" on:click={toggleTheme} aria-label="Toggle theme">
			{theme === 'dark' ? '☀' : '☾'}
		</button>
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
		<div class="dl-panel chart-panel">
			<div class="dl-panel-header">
				<span class="dl-panel-title mono">
					{dashboard.measures.find((m) => m.name === dashboard.layout.timeseries_measure)?.label ?? 'timeseries'}
				</span>
				{#if $comparisonEnabled}
					<span class="dl-badge dim">vs prior period</span>
				{/if}
			</div>
			<div class="chart-body">
				<TimeseriesChart
					rows={chartRows}
					comparisonRows={$comparisonEnabled ? chartCompRows : []}
					label={dashboard.measures.find((m) => m.name === dashboard.layout.timeseries_measure)?.label ?? ''}
					loading={chartLoading}
					error={chartError}
				/>
			</div>
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
			<div class="dl-panel raw-data-section">
				<div class="dl-panel-header">
					<span class="dl-panel-title">raw data</span>
					{#if !rawLoading && !rawError}
						<span class="dl-badge dim">
							{rawRows.length}{rawRows.length === 500 ? ' rows (limit 500)' : ' rows'}
						</span>
					{/if}
				</div>
				{#if rawLoading}
					<div class="state-msg">
						<span class="dl-spinner"></span>
						Loading…
					</div>
				{:else if rawError}
					<div class="state-msg" style="color:var(--danger-text)">{rawError}</div>
				{:else if rawRows.length === 0}
					<div class="state-msg">No rows match the current filters and time range.</div>
				{:else}
					{@const columns = Object.keys(rawRows[0])}
					<div class="raw-table-wrap">
						<table class="dl-table">
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
											<td class="mono" title={String(row[col] ?? '')}>{row[col] ?? ''}</td>
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
{/if}

</div><!-- end .app -->

<style>
	/* ── App shell ─────────────────────────────────────────────────────────── */
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--fg);
	}

	/* ── Boot screen ───────────────────────────────────────────────────────── */
	.boot-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		gap: var(--sp-6);
		background: var(--bg);
	}

	.boot-msg {
		font-family: var(--font-mono);
		font-size: var(--fs-12);
		color: var(--fg-muted);
		margin: 0;
	}

	.boot-error {
		font-family: var(--font-mono);
		font-size: var(--fs-11);
		background: var(--danger-bg);
		color: var(--danger-text);
		border: 1px solid var(--danger);
		padding: var(--sp-6) var(--sp-7);
		border-radius: var(--r-3);
		max-width: 600px;
		overflow: auto;
		margin: 0;
	}

	/* ── Theme toggle button ────────────────────────────────────────────────── */
	.theme-toggle {
		width: 26px;
		padding: 0;
		font-size: 12px;
	}

	/* ── Wizard ────────────────────────────────────────────────────────────── */
	.wizard-body {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.wizard-panel {
		flex: 1;
		padding: var(--sp-10) var(--sp-9);
		overflow-y: auto;
		background: var(--bg);
	}

	.yaml-sidebar {
		width: 340px;
		flex-shrink: 0;
		border-left: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		padding: var(--sp-6);
		background: var(--surface);
	}

	/* ── Connect step ──────────────────────────────────────────────────────── */
	.wizard-step {
		max-width: 560px;
	}

	.step-heading {
		font-size: var(--fs-22);
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--fg);
		margin: 0 0 var(--sp-2);
	}

	.step-sub {
		font-size: var(--fs-13);
		color: var(--fg-muted);
		margin: 0 0 var(--sp-8);
	}

	.sample-box {
		margin-bottom: var(--sp-7);
	}

	.sample-desc {
		font-size: var(--fs-12);
		color: var(--fg-muted);
		margin: 0 0 var(--sp-5);
	}

	.inline-error {
		margin-top: var(--sp-4);
		font-size: var(--fs-11);
		color: var(--danger-text);
		font-family: var(--font-mono);
	}

	.or-divider {
		display: flex;
		align-items: center;
		gap: var(--sp-5);
		margin: var(--sp-7) 0;
	}
	.or-divider::before,
	.or-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.connected-list {
		margin-top: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.connected-item {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		font-size: var(--fs-12);
		color: var(--fg);
	}

	.wizard-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--sp-8);
	}

	/* ── Shared global button styles (used by child wizards) ─────────────── */
	:global(.btn-primary) {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-3);
		height: 26px;
		padding: 0 var(--sp-5);
		background: var(--accent);
		color: var(--accent-fg);
		border: 1px solid var(--accent);
		border-radius: var(--r-2);
		cursor: pointer;
		font-family: var(--font-sans);
		font-size: var(--fs-12);
		font-weight: 500;
	}
	:global(.btn-primary:disabled) { opacity: 0.5; cursor: not-allowed; }
	:global(.btn-primary:hover:not(:disabled)) { background: var(--accent-hover); border-color: var(--accent-hover); }

	:global(.btn-secondary) {
		display: inline-flex;
		align-items: center;
		height: 26px;
		padding: 0 var(--sp-5);
		background: var(--surface);
		color: var(--fg);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-2);
		cursor: pointer;
		font-family: var(--font-sans);
		font-size: var(--fs-12);
	}
	:global(.btn-secondary:hover) { background: var(--surface-hover); }

	/* ── Dashboard ─────────────────────────────────────────────────────────── */
	.compare-label {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		cursor: pointer;
	}

	.yaml-overlay {
		position: fixed;
		top: 40px;
		right: 0;
		width: 360px;
		height: calc(100vh - 40px);
		border-left: 1px solid var(--border);
		background: var(--surface);
		z-index: 100;
		box-shadow: -4px 0 24px oklch(0% 0 0 / 0.12);
		display: flex;
		flex-direction: column;
	}

	.dashboard-body {
		flex: 1;
		padding: var(--sp-7) var(--sp-8);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
		background: var(--bg);
	}

	.filter-bar {
		padding: var(--sp-4) var(--sp-6);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-3);
	}

	.metric-cards {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-5);
	}

	.chart-panel { overflow: hidden; }

	.chart-body {
		height: 280px;
		overflow: hidden;
	}

	.leaderboards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: var(--sp-5);
	}

	/* ── Raw data ──────────────────────────────────────────────────────────── */
	.raw-table-wrap {
		overflow-x: auto;
		max-height: 420px;
		overflow-y: auto;
	}

	.raw-table-wrap .dl-table td {
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.state-msg {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-4);
		padding: var(--sp-9);
		font-size: var(--fs-12);
		color: var(--fg-muted);
		font-family: var(--font-mono);
	}

	/* ── Mono utility ───────────────────────────────────────────────────────── */
	.mono { font-family: var(--font-mono); }

	/* ── Responsive ────────────────────────────────────────────────────────── */
	@media (max-width: 640px) {
		.dl-sidebar { display: none; }
		.wizard-panel { padding: var(--sp-7); }
		.yaml-sidebar { display: none; }
		.dashboard-body { padding: var(--sp-5); }
		.yaml-overlay { width: 100vw; }
	}
</style>
