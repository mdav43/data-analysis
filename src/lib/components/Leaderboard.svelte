<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { LeaderboardRow, MeasureFormat } from '$lib/types';
	import { formatMeasureValue } from '$lib/query/totals';

	export let title: string;
	export let dimension: string;
	export let rows: LeaderboardRow[] = [];
	export let format: MeasureFormat = 'number';
	export let comparisonEnabled = false;
	export let loading = false;
	export let error: string | null = null;

	const dispatch = createEventDispatcher<{ filter: { dimension: string; value: string } }>();

	function deltaClass(delta?: number): string {
		if (delta == null) return '';
		return delta >= 0 ? 'up' : 'down';
	}

	function formatDelta(delta: number): string {
		return `${delta >= 0 ? '+' : ''}${formatMeasureValue(delta, format)}`;
	}

	function formatPct(pct: number): string {
		return `${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(1)}%`;
	}

	function handleRowClick(value: string) {
		dispatch('filter', { dimension, value });
	}
</script>

<div class="dl-panel leaderboard">
	<div class="dl-panel-header">
		<span class="dl-panel-title">{title}</span>
	</div>
	{#if loading}
		<div class="state-msg">
			<span class="dl-spinner"></span>
		</div>
	{:else if error}
		<div class="state-msg error">{error}</div>
	{:else if rows.length === 0}
		<div class="state-msg">No data for this period</div>
	{:else}
		<div class="table-wrap">
			<table class="dl-table">
				<thead>
					<tr>
						<th class="rank">#</th>
						<th>{dimension}</th>
						<th class="num">value</th>
						{#if comparisonEnabled}
							<th class="num">vs prior</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each rows as row, i}
						<!-- svelte-ignore a11y-interactive-supports-focus -->
						<tr
							class="clickable"
							on:click={() => handleRowClick(row.dimension_value)}
							on:keydown={(e) => e.key === 'Enter' && handleRowClick(row.dimension_value)}
							role="button"
							tabindex="0"
							title="Filter: {dimension} = {row.dimension_value}"
						>
							<td class="rank">{i + 1}</td>
							<td class="mono">{row.dimension_value}</td>
							<td class="num mono">{formatMeasureValue(row.value, format)}</td>
							{#if comparisonEnabled}
								<td class="num mono dl-delta {row.delta != null ? deltaClass(row.delta) : ''}">
									{#if row.delta != null}
										{formatDelta(row.delta)}
										{#if row.delta_pct != null}
											<span class="pct">({formatPct(row.delta_pct)})</span>
										{/if}
									{:else}
										—
									{/if}
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.leaderboard { overflow: hidden; }

	.table-wrap { overflow: auto; }

	.rank {
		color: var(--fg-faint);
		width: 28px;
		text-align: center;
		font-family: var(--font-mono);
		font-size: var(--fs-10);
	}

	.num { text-align: right; }

	.mono { font-family: var(--font-mono); }

	.clickable { cursor: pointer; }

	.state-msg {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-9);
		font-family: var(--font-mono);
		font-size: var(--fs-12);
		color: var(--fg-muted);
	}
	.state-msg.error { color: var(--danger-text); justify-content: flex-start; padding: var(--sp-6); }

	.pct {
		font-size: var(--fs-10);
		color: var(--fg-subtle);
		margin-left: 2px;
	}
</style>
