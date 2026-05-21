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

<div class="leaderboard">
	<h3>{title}</h3>
	{#if loading}
		<div class="state-msg">Loading…</div>
	{:else if error}
		<div class="state-msg error">{error}</div>
	{:else if rows.length === 0}
		<div class="state-msg">No data for this period</div>
	{:else}
		<table>
			<thead>
				<tr>
					<th class="rank">#</th>
					<th>{dimension}</th>
					<th class="num">Value</th>
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
						title="Filter by {dimension} = {row.dimension_value}"
					>
						<td class="rank">{i + 1}</td>
						<td>{row.dimension_value}</td>
						<td class="num">{formatMeasureValue(row.value, format)}</td>
						{#if comparisonEnabled}
							<td class="num delta {row.delta != null ? deltaClass(row.delta) : ''}">
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
	{/if}
</div>

<style>
	.leaderboard {
		background: white;
		border: 1px solid #e8eaf0;
		border-radius: 8px;
		padding: 1rem;
		overflow: auto;
	}

	h3 {
		margin: 0 0 0.75rem;
		font-size: 0.8rem;
		font-weight: 700;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	th {
		text-align: left;
		padding: 0.35rem 0.5rem;
		border-bottom: 2px solid #e8eaf0;
		color: #999;
		font-weight: 600;
		font-size: 0.75rem;
	}

	td {
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid #f5f5f5;
	}

	.rank {
		color: #bbb;
		width: 1.5rem;
		text-align: center;
		font-size: 0.75rem;
	}

	.num {
		text-align: right;
	}

	.clickable {
		cursor: pointer;
		transition: background 0.1s;
	}
	.clickable:hover {
		background: #f5f7ff;
	}

	.delta.up {
		color: #16a34a;
		font-weight: 600;
	}
	.delta.down {
		color: #dc2626;
		font-weight: 600;
	}

	.pct {
		font-size: 0.7rem;
		opacity: 0.8;
		font-weight: normal;
		margin-left: 0.2rem;
	}

	.state-msg {
		color: #bbb;
		font-size: 0.875rem;
		padding: 1rem 0;
		text-align: center;
	}
	.state-msg.error {
		color: #dc2626;
		text-align: left;
	}
</style>
