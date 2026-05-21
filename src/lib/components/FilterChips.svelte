<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { DimensionFilter } from '$lib/types';

	export let filters: DimensionFilter[] = [];

	const dispatch = createEventDispatcher<{ remove: DimensionFilter; clear: void }>();
</script>

{#if filters.length > 0}
	<div class="filter-chips">
		{#each filters as filter (`${filter.dimension}:${filter.value}`)}
			<span class="chip">
				<span class="chip-label"
					>{filter.dimension}: <strong>{filter.value}</strong></span
				>
				<button
					class="chip-remove"
					on:click={() => dispatch('remove', filter)}
					aria-label="Remove {filter.dimension} = {filter.value} filter"
				>×</button>
			</span>
		{/each}
		<button class="clear-all" on:click={() => dispatch('clear')}>Clear all</button>
	</div>
{/if}

<style>
	.filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: #e8f0fe;
		border: 1px solid #c0d2f7;
		border-radius: 100px;
		font-size: 0.8rem;
		color: #2d4a9a;
	}

	.chip-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: #2d4a9a;
		font-size: 1rem;
		padding: 0;
		line-height: 1;
		opacity: 0.7;
		transition: opacity 0.15s;
	}
	.chip-remove:hover {
		opacity: 1;
	}

	.clear-all {
		background: none;
		border: none;
		cursor: pointer;
		color: #888;
		font-size: 0.8rem;
		text-decoration: underline;
		padding: 0;
	}
	.clear-all:hover {
		color: #333;
	}
</style>
