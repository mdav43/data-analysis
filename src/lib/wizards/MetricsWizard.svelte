<script lang="ts">
	import { models, dashboards, setDashboard, wizardStep } from '$lib/state/wizard';
	import { getTableSchema } from '$lib/duck/schema';
	import type { Measure, Dimension, TimeGrain, MeasureFormat } from '$lib/types';

	$: modelName = $models[0]?.name ?? '';

	let timeseriesCol = '';
	let defaultRange = 'P30D';
	let defaultGrain: TimeGrain = 'day';
	let measures: Measure[] = [{ name: 'record_count', label: 'Count', expr: 'COUNT(*)', format: 'number' }];
	let dimensions: Dimension[] = [];

	// New measure form
	let mName = '';
	let mLabel = '';
	let mExpr = '';
	let mFormat: MeasureFormat = 'number';

	// New dimension form
	let dName = '';
	let dCol = '';

	// Schema suggestions
	interface SuggestedDimension { column: string; selected: boolean }
	interface SuggestedMeasure { column: string; selected: boolean }
	let suggestions: { dimensions: SuggestedDimension[]; measures: SuggestedMeasure[] } | null = null;
	let suggesting = false;
	let suggestError = '';

	const NUMERIC_TYPES = ['INTEGER', 'INT', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'SMALLINT', 'TINYINT', 'UBIGINT', 'UINTEGER', 'USMALLINT', 'UTINYINT', 'REAL', 'NUMERIC'];
	const TEMPORAL_TYPES = ['TIMESTAMP', 'DATE', 'TIME'];

	function isNumeric(type: string): boolean {
		const t = type.toUpperCase();
		return NUMERIC_TYPES.some((n) => t.includes(n));
	}

	function isTemporal(type: string): boolean {
		const t = type.toUpperCase();
		return TEMPORAL_TYPES.some((n) => t.includes(n));
	}

	function humanize(col: string): string {
		return col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	async function suggestFromSchema() {
		if (!modelName) return;
		suggesting = true;
		suggestError = '';
		try {
			const columns = await getTableSchema(modelName);
			const dimCandidates: SuggestedDimension[] = [];
			const measureCandidates: SuggestedMeasure[] = [];
			for (const col of columns) {
				if (col.name === timeseriesCol) continue;
				if (isTemporal(col.type)) continue;
				if (isNumeric(col.type)) {
					measureCandidates.push({ column: col.name, selected: true });
				} else {
					dimCandidates.push({ column: col.name, selected: true });
				}
			}
			suggestions = { dimensions: dimCandidates, measures: measureCandidates };
		} catch (e) {
			suggestError = e instanceof Error ? e.message : 'Failed to load schema';
		} finally {
			suggesting = false;
		}
	}

	function applysuggestions() {
		if (!suggestions) return;
		for (const d of suggestions.dimensions) {
			if (d.selected && !dimensions.some((x) => x.column === d.column)) {
				dimensions = [...dimensions, { name: d.column, column: d.column }];
			}
		}
		for (const m of suggestions.measures) {
			if (m.selected && !measures.some((x) => x.name === m.column)) {
				measures = [
					...measures,
					{ name: m.column, label: `${humanize(m.column)} Overall`, expr: `SUM(${m.column})`, format: 'number' }
				];
			}
		}
		suggestions = null;
	}

	function addMeasure() {
		if (!mName || !mExpr) return;
		measures = [
			...measures,
			{ name: mName, label: mLabel || mName, expr: mExpr, format: mFormat }
		];
		mName = '';
		mLabel = '';
		mExpr = '';
		mFormat = 'number';
	}

	function removeMeasure(i: number) {
		measures = measures.filter((_, idx) => idx !== i);
	}

	function addDimension() {
		if (!dName || !dCol) return;
		dimensions = [...dimensions, { name: dName, column: dCol }];
		dName = '';
		dCol = '';
	}

	function removeDimension(i: number) {
		dimensions = dimensions.filter((_, idx) => idx !== i);
	}

	function handleNext() {
		if (!modelName || !timeseriesCol || measures.length === 0) return;
		const existing = $dashboards[0];
		setDashboard({
			kind: 'dashboard',
			name: existing?.name ?? 'My Dashboard',
			model: modelName,
			timeseries: timeseriesCol,
			default_time_range: defaultRange,
			default_grain: defaultGrain,
			comparison: existing?.comparison ?? { enabled: false, mode: 'previous_period' },
			dimensions,
			measures,
			layout: {
				metric_cards: measures.map((m) => m.name),
				timeseries_measure: measures[0]?.name ?? '',
				leaderboard_dimensions: dimensions.map((d) => d.name)
			}
		});
		wizardStep.set('dashboard');
	}

	$: canProceed = !!modelName && !!timeseriesCol;
</script>

<div class="wizard-step">
	<div class="eyebrow" style="margin-bottom:var(--sp-3)">Step 03</div>
	<h2>Metrics</h2>
	<p class="subtitle">Define the timeseries column, measures, and dimensions.</p>

	<div class="suggest-row">
		<button class="btn-suggest" on:click={suggestFromSchema} disabled={!modelName || suggesting}>
			{suggesting ? 'Loading schema…' : 'Suggest from schema'}
		</button>
		{#if suggestError}<span class="suggest-error">{suggestError}</span>{/if}
	</div>

	{#if suggestions}
		<div class="suggestions-panel">
			{#if suggestions.dimensions.length > 0}
				<p class="suggest-section-label">Dimensions</p>
				{#each suggestions.dimensions as d}
					<label class="suggest-item">
						<input type="checkbox" bind:checked={d.selected} />
						<span>{d.column}</span>
					</label>
				{/each}
			{/if}
			{#if suggestions.measures.length > 0}
				<p class="suggest-section-label">Measures</p>
				{#each suggestions.measures as m}
					<label class="suggest-item">
						<input type="checkbox" bind:checked={m.selected} />
						<span>{humanize(m.column)} Overall — <code>SUM({m.column})</code></span>
					</label>
				{/each}
			{/if}
			<div class="suggest-actions">
				<button class="btn-add" on:click={applysuggestions}>Add selected</button>
				<button class="btn-secondary" on:click={() => (suggestions = null)}>Cancel</button>
			</div>
		</div>
	{/if}

	<div class="form-group">
		<label for="ts-col">Timeseries column</label>
		<input id="ts-col" type="text" bind:value={timeseriesCol} placeholder="e.g. ordered_at" />
	</div>

	<div class="form-row">
		<div class="form-group">
			<label for="default-range">Default time range</label>
			<select id="default-range" bind:value={defaultRange}>
				<option value="P7D">Last 7 days</option>
				<option value="P30D">Last 30 days</option>
				<option value="P90D">Last 90 days</option>
				<option value="P365D">Last 365 days</option>
			</select>
		</div>
		<div class="form-group">
			<label for="default-grain">Default grain</label>
			<select id="default-grain" bind:value={defaultGrain}>
				<option value="hour">Hour</option>
				<option value="day">Day</option>
				<option value="week">Week</option>
				<option value="month">Month</option>
				<option value="quarter">Quarter</option>
				<option value="year">Year</option>
			</select>
		</div>
	</div>

	<section>
		<h3>Measures</h3>
		{#each measures as m, i}
			<div class="tag-row">
				<span class="tag">{m.label} — <code>{m.expr}</code></span>
				<button class="remove-btn" on:click={() => removeMeasure(i)} aria-label="Remove {m.name}"
					>×</button
				>
			</div>
		{/each}
		<div class="add-form measures-form">
			<input type="text" bind:value={mName} placeholder="name (e.g. revenue)" />
			<input type="text" bind:value={mLabel} placeholder="label (e.g. Revenue)" />
			<input type="text" bind:value={mExpr} placeholder="SQL expr (e.g. SUM(amount))" />
			<select bind:value={mFormat}>
				<option value="number">Number</option>
				<option value="usd">USD</option>
				<option value="percent">Percent</option>
			</select>
			<button class="btn-add" on:click={addMeasure} disabled={!mName || !mExpr}>Add</button>
		</div>
	</section>

	<section>
		<h3>Dimensions</h3>
		{#each dimensions as d, i}
			<div class="tag-row">
				<span class="tag">{d.name} → <code>{d.column}</code></span>
				<button
					class="remove-btn"
					on:click={() => removeDimension(i)}
					aria-label="Remove {d.name}">×</button
				>
			</div>
		{/each}
		<div class="add-form dims-form">
			<input type="text" bind:value={dName} placeholder="name (e.g. country)" />
			<input type="text" bind:value={dCol} placeholder="column (e.g. country)" />
			<button class="btn-add" on:click={addDimension} disabled={!dName || !dCol}>Add</button>
		</div>
	</section>

	<div class="actions">
		<button class="btn-secondary" on:click={() => wizardStep.set('model')}>← Back</button>
		<button class="btn-primary" on:click={handleNext} disabled={!canProceed}>Next →</button>
	</div>
</div>

<style>
	.wizard-step { max-width: 700px; }

	h2 {
		font-size: var(--fs-22);
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--fg);
		margin: 0 0 var(--sp-2);
	}

	.subtitle {
		font-size: var(--fs-13);
		color: var(--fg-muted);
		margin: 0 0 var(--sp-8);
	}

	.form-group { margin-bottom: var(--sp-6); }

	label {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--fs-11);
		font-weight: 500;
		color: var(--fg-muted);
		margin-bottom: var(--sp-2);
		letter-spacing: 0.02em;
	}

	input[type='text'],
	select {
		width: 100%;
		height: 28px;
		padding: 0 var(--sp-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-2);
		font-family: var(--font-mono);
		font-size: var(--fs-12);
		box-sizing: border-box;
		background: var(--surface);
		color: var(--fg);
	}
	input:focus, select:focus {
		outline: 1px solid var(--accent);
		outline-offset: -1px;
		border-color: var(--accent);
	}

	.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-5); margin-bottom: var(--sp-5); }

	section { margin-bottom: var(--sp-8); }

	h3 {
		font-family: var(--font-mono);
		font-size: var(--fs-10);
		font-weight: 500;
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 var(--sp-4);
	}

	.tag-row { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-2); }

	.tag {
		font-family: var(--font-mono);
		font-size: var(--fs-11);
		background: var(--accent-bg);
		padding: 2px var(--sp-4);
		border-radius: var(--r-1);
		border: 1px solid var(--accent-border);
		color: var(--accent-text);
	}

	.remove-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--fg-faint);
		font-size: 14px;
		padding: 0;
		line-height: 1;
	}
	.remove-btn:hover { color: var(--danger-text); }

	.add-form { display: grid; gap: var(--sp-3); margin-top: var(--sp-4); }
	.measures-form { grid-template-columns: 1fr 1fr 1.5fr 0.8fr auto; }
	.dims-form { grid-template-columns: 1fr 1fr auto; }

	.btn-add {
		height: 28px;
		padding: 0 var(--sp-5);
		background: var(--accent-bg);
		border: 1px solid var(--accent-border);
		color: var(--accent-text);
		border-radius: var(--r-2);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: var(--fs-11);
		white-space: nowrap;
	}
	.btn-add:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn-add:hover:not(:disabled) { background: var(--surface-hover); }

	.suggest-row { display: flex; align-items: center; gap: var(--sp-5); margin-bottom: var(--sp-7); }

	.btn-suggest {
		height: 26px;
		padding: 0 var(--sp-5);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		color: var(--fg-muted);
		border-radius: var(--r-2);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: var(--fs-11);
	}
	.btn-suggest:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn-suggest:hover:not(:disabled) { background: var(--surface-hover); color: var(--fg); }

	.suggest-error { font-family: var(--font-mono); font-size: var(--fs-11); color: var(--danger-text); }

	.suggestions-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-3);
		padding: var(--sp-6);
		margin-bottom: var(--sp-7);
	}

	.suggest-section-label {
		font-family: var(--font-mono);
		font-size: var(--fs-10);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-subtle);
		margin: var(--sp-5) 0 var(--sp-3);
	}
	.suggest-section-label:first-child { margin-top: 0; }

	.suggest-item {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		font-family: var(--font-mono);
		font-size: var(--fs-12);
		color: var(--fg);
		margin-bottom: var(--sp-2);
		cursor: pointer;
	}

	.suggest-actions { display: flex; gap: var(--sp-4); margin-top: var(--sp-5); }

	.actions { display: flex; gap: var(--sp-4); justify-content: flex-end; margin-top: var(--sp-8); }
</style>
