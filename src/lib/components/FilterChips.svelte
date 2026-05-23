<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { DimensionFilter } from '$lib/types';

	export let filters: DimensionFilter[] = [];

	const dispatch = createEventDispatcher<{ remove: DimensionFilter; clear: void }>();
</script>

{#if filters.length > 0}
	<div class="filter-chips">
		{#each filters as filter (`${filter.dimension}:${filter.value}`)}
			<span class="dl-badge green chip">
				<span class="chip-label">{filter.dimension}: <strong>{filter.value}</strong></span>
				<button
					class="chip-remove"
					on:click={() => dispatch('remove', filter)}
					aria-label="Remove {filter.dimension} = {filter.value} filter"
				>×</button>
			</span>
		{/each}
		<button class="clear-all" on:click={() => dispatch('clear')}>clear all</button>
	</div>
{/if}

<style>
	.filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: center;
	}

	.chip {
		height: auto;
		padding: 2px var(--sp-4);
		gap: var(--sp-3);
	}

	.chip-label {
		font-family: var(--font-mono);
		font-size: var(--fs-11);
	}

	.chip-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--accent-text);
		font-size: 14px;
		padding: 0;
		line-height: 1;
		opacity: 0.7;
		transition: opacity 0.1s;
	}
	.chip-remove:hover { opacity: 1; }

	.clear-all {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: var(--fs-11);
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.clear-all:hover { color: var(--fg); }
</style>
