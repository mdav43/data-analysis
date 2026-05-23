<script lang="ts">
	import { dashboards, setDashboard, wizardStep } from '$lib/state/wizard';
	import { activeRange, comparisonEnabled } from '$lib/state/dashboard';
	import { resolveTimeRange, fetchDataTimeRange } from '$lib/query/timerange';
	import type { TimeRangePreset } from '$lib/types';

	$: dashboard = $dashboards[0];
	$: measures = dashboard?.measures ?? [];
	$: dimensions = dashboard?.dimensions ?? [];

	let name = dashboard?.name ?? 'My Dashboard';
	let metricCards: string[] = dashboard?.layout.metric_cards ?? [];
	let timeseriesMeasure = dashboard?.layout.timeseries_measure ?? '';
	let leaderboardDimensions: string[] = dashboard?.layout.leaderboard_dimensions ?? [];
	let enableComparison = dashboard?.comparison?.enabled ?? false;
	let defaultRange = (dashboard?.default_time_range ?? 'ALL') as TimeRangePreset;

	function toggleMetricCard(mname: string) {
		metricCards = metricCards.includes(mname)
			? metricCards.filter((m) => m !== mname)
			: [...metricCards, mname];
	}

	function toggleLeaderboardDimension(dname: string) {
		leaderboardDimensions = leaderboardDimensions.includes(dname)
			? leaderboardDimensions.filter((d) => d !== dname)
			: [...leaderboardDimensions, dname];
	}

	async function handleLaunch() {
		if (!dashboard) return;
		const updated = {
			...dashboard,
			name,
			default_time_range: defaultRange,
			comparison: { enabled: enableComparison, mode: 'previous_period' as const },
			layout: {
				metric_cards: metricCards,
				timeseries_measure: timeseriesMeasure,
				leaderboard_dimensions: leaderboardDimensions
			}
		};
		setDashboard(updated);
		comparisonEnabled.set(enableComparison);
		try {
			const dataRange = await fetchDataTimeRange(updated.model, updated.timeseries);
			activeRange.set(
				defaultRange === 'ALL'
					? dataRange
					: resolveTimeRange(defaultRange as Exclude<TimeRangePreset, 'ALL'>, dataRange.end)
			);
		} catch {
			activeRange.set(resolveTimeRange('P365D'));
		}
		wizardStep.set('done');
	}

	$: canLaunch = !!dashboard;
</script>

<div class="wizard-step">
	<div class="eyebrow" style="margin-bottom:var(--sp-3)">Step 04</div>
	<h2>Dashboard</h2>
	<p class="subtitle">Configure your dashboard layout and settings.</p>

	<div class="form-group">
		<label for="dash-name">Dashboard name</label>
		<input id="dash-name" type="text" bind:value={name} />
	</div>

	<div class="form-group">
		<label for="default-range">Default time range</label>
		<select id="default-range" bind:value={defaultRange}>
			<option value="ALL">All data</option>
			<option value="P7D">Last 7 days</option>
			<option value="P30D">Last 30 days</option>
			<option value="P90D">Last 90 days</option>
			<option value="P365D">Last 365 days</option>
		</select>
	</div>

	<section>
		<h3>Metric cards <span class="hint">— pick measures to show</span></h3>
		<div class="check-list">
			{#each measures as m}
				<label class="check-item">
					<input
						type="checkbox"
						checked={metricCards.includes(m.name)}
						on:change={() => toggleMetricCard(m.name)}
					/>
					{m.label}
				</label>
			{/each}
			{#if measures.length === 0}
				<span class="empty-hint">No measures defined — go back to Metrics</span>
			{/if}
		</div>
	</section>

	<section>
		<h3>Timeseries chart measure</h3>
		<select bind:value={timeseriesMeasure}>
			<option value="">— select —</option>
			{#each measures as m}
				<option value={m.name}>{m.label}</option>
			{/each}
		</select>
	</section>

	<section>
		<h3>Leaderboard dimensions <span class="hint">— click rows to filter</span></h3>
		<div class="check-list">
			{#each dimensions as d}
				<label class="check-item">
					<input
						type="checkbox"
						checked={leaderboardDimensions.includes(d.name)}
						on:change={() => toggleLeaderboardDimension(d.name)}
					/>
					{d.name}
				</label>
			{/each}
			{#if dimensions.length === 0}
				<span class="empty-hint">No dimensions defined — go back to Metrics</span>
			{/if}
		</div>
	</section>

	<section>
		<h3>Period-over-period comparison</h3>
		<label class="check-item">
			<input type="checkbox" bind:checked={enableComparison} />
			Enable (shows prior period as dashed series + delta values)
		</label>
	</section>

	<div class="actions">
		<button class="btn-secondary" on:click={() => wizardStep.set('metrics')}>← Back</button>
		<button class="btn-primary" on:click={handleLaunch} disabled={!canLaunch}>
			Launch dashboard →
		</button>
	</div>
</div>

<style>
	.wizard-step { max-width: 560px; }

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

	label:not(.check-item) {
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

	.hint {
		font-weight: normal;
		text-transform: none;
		letter-spacing: 0;
		color: var(--fg-faint);
		font-size: var(--fs-10);
	}

	.check-list { display: flex; flex-direction: column; gap: var(--sp-3); }

	.check-item {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		font-family: var(--font-mono);
		font-size: var(--fs-12);
		color: var(--fg);
		cursor: pointer;
	}

	.check-item input[type='checkbox'] { width: auto; cursor: pointer; accent-color: var(--accent); }

	.empty-hint { font-family: var(--font-mono); font-size: var(--fs-12); color: var(--fg-muted); }

	.actions { display: flex; gap: var(--sp-4); justify-content: flex-end; margin-top: var(--sp-8); }
</style>
