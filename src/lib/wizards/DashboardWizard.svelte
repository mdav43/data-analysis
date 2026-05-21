<script lang="ts">
	import { dashboards, setDashboard, wizardStep } from '$lib/state/wizard';
	import { activeRange, comparisonEnabled } from '$lib/state/dashboard';
	import { resolveTimeRange } from '$lib/query/timerange';
	import type { TimeRangePreset } from '$lib/types';

	$: dashboard = $dashboards[0];
	$: measures = dashboard?.measures ?? [];
	$: dimensions = dashboard?.dimensions ?? [];

	let name = dashboard?.name ?? 'My Dashboard';
	let metricCards: string[] = dashboard?.layout.metric_cards ?? [];
	let timeseriesMeasure = dashboard?.layout.timeseries_measure ?? '';
	let leaderboardDimensions: string[] = dashboard?.layout.leaderboard_dimensions ?? [];
	let enableComparison = dashboard?.comparison?.enabled ?? false;
	let defaultRange = (dashboard?.default_time_range ?? 'P30D') as TimeRangePreset;

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

	function handleLaunch() {
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
		activeRange.set(resolveTimeRange(defaultRange));
		comparisonEnabled.set(enableComparison);
		wizardStep.set('done');
	}

	$: canLaunch = !!dashboard && metricCards.length > 0 && !!timeseriesMeasure;
</script>

<div class="wizard-step">
	<h2>4. Dashboard</h2>
	<p class="subtitle">Configure your dashboard layout and settings.</p>

	<div class="form-group">
		<label for="dash-name">Dashboard name</label>
		<input id="dash-name" type="text" bind:value={name} />
	</div>

	<div class="form-group">
		<label for="default-range">Default time range</label>
		<select id="default-range" bind:value={defaultRange}>
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
	.wizard-step {
		max-width: 520px;
	}

	h2 {
		margin: 0 0 0.25rem;
		font-size: 1.2rem;
		color: #1a1a2e;
	}

	.subtitle {
		margin: 0 0 1.5rem;
		color: #777;
		font-size: 0.9rem;
	}

	.form-group {
		margin-bottom: 1rem;
	}

	label:not(.check-item) {
		display: block;
		font-size: 0.8rem;
		font-weight: 600;
		color: #555;
		margin-bottom: 0.3rem;
	}

	input[type='text'],
	select {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid #d8dce8;
		border-radius: 6px;
		font-size: 0.875rem;
		box-sizing: border-box;
		background: white;
	}

	section {
		margin-bottom: 1.5rem;
	}

	h3 {
		font-size: 0.75rem;
		font-weight: 700;
		color: #777;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 0.6rem;
	}

	.hint {
		font-weight: normal;
		text-transform: none;
		letter-spacing: 0;
		color: #aaa;
		font-size: 0.72rem;
	}

	.check-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.check-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #333;
		cursor: pointer;
	}

	.check-item input[type='checkbox'] {
		width: auto;
		cursor: pointer;
	}

	.empty-hint {
		color: #bbb;
		font-size: 0.8rem;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}
</style>
