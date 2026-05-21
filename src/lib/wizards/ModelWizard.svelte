<script lang="ts">
	import { sources, models, setModel, wizardStep } from '$lib/state/wizard';
	import { generateJoinSQL, buildCreateViewSQL } from '$lib/query/model';
	import { query } from '$lib/duck/index';

	let baseTable = $sources[0]?.name ?? '';
	let joinTable = '';
	let leftKey = '';
	let rightKey = '';
	let generatedSQL = '';
	let viewName = 'enriched_model';
	let createError = '';
	let creating = false;

	$: tableNames = $sources.map((s) => s.name);

	$: {
		if (baseTable) {
			try {
				const joins =
					joinTable && leftKey && rightKey
						? [{ table: joinTable, leftKey, rightKey }]
						: [];
				generatedSQL = generateJoinSQL({ base: baseTable, joins });
			} catch {
				generatedSQL = '';
			}
		} else {
			generatedSQL = '';
		}
	}

	async function handleCreate() {
		if (!generatedSQL) return;
		creating = true;
		createError = '';
		try {
			await query(buildCreateViewSQL(viewName, generatedSQL));
			setModel({ kind: 'model', name: viewName, sql: generatedSQL, materialize: 'view' });
			wizardStep.set('metrics');
		} catch (e) {
			createError = String(e);
		} finally {
			creating = false;
		}
	}

	function handleSkip() {
		if (baseTable) {
			const sql = `SELECT *\nFROM ${baseTable}`;
			setModel({ kind: 'model', name: baseTable, sql, materialize: 'view' });
		}
		wizardStep.set('metrics');
	}
</script>

<div class="wizard-step">
	<h2>2. Model</h2>
	<p class="subtitle">Select a base table and optionally join another table.</p>

	{#if tableNames.length === 0}
		<div class="empty-hint">No tables registered yet — go back to Connect Data.</div>
	{:else}
		<div class="form-group">
			<label for="base-table">Base table</label>
			<select id="base-table" bind:value={baseTable}>
				<option value="">— select —</option>
				{#each tableNames as t}
					<option value={t}>{t}</option>
				{/each}
			</select>
		</div>

		{#if baseTable}
			<div class="form-group">
				<label for="join-table">Join table <span class="opt">(optional)</span></label>
				<select id="join-table" bind:value={joinTable}>
					<option value="">— none —</option>
					{#each tableNames.filter((t) => t !== baseTable) as t}
						<option value={t}>{t}</option>
					{/each}
				</select>
			</div>

			{#if joinTable}
				<div class="form-row">
					<div class="form-group">
						<label for="left-key">Key in {baseTable}</label>
						<input id="left-key" type="text" bind:value={leftKey} placeholder="e.g. customer_id" />
					</div>
					<div class="form-group">
						<label for="right-key">Key in {joinTable}</label>
						<input
							id="right-key"
							type="text"
							bind:value={rightKey}
							placeholder="e.g. customer_id"
						/>
					</div>
				</div>
			{/if}

			{#if generatedSQL}
				<div class="form-group">
					<label for="sql-editor">Generated SQL <span class="opt">(editable)</span></label>
					<textarea id="sql-editor" bind:value={generatedSQL} rows="5" class="sql-editor"></textarea>
				</div>

				<div class="form-group">
					<label for="view-name">View name</label>
					<input id="view-name" type="text" bind:value={viewName} />
				</div>
			{/if}
		{/if}

		{#if createError}
			<div class="error-box">{createError}</div>
		{/if}

		<div class="actions">
			<button class="btn-secondary" on:click={() => wizardStep.set('connect')}>← Back</button>
			<button class="btn-secondary" on:click={handleSkip}>Skip join →</button>
			<button class="btn-primary" on:click={handleCreate} disabled={!generatedSQL || creating}>
				{creating ? 'Creating…' : 'Create view →'}
			</button>
		</div>
	{/if}
</div>

<style>
	.wizard-step {
		max-width: 560px;
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

	label {
		display: block;
		font-size: 0.8rem;
		font-weight: 600;
		color: #555;
		margin-bottom: 0.3rem;
	}

	.opt {
		font-weight: normal;
		color: #bbb;
	}

	select,
	input[type='text'] {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 1px solid #d8dce8;
		border-radius: 6px;
		font-size: 0.875rem;
		box-sizing: border-box;
		background: white;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.sql-editor {
		width: 100%;
		font-family: 'Menlo', 'Monaco', monospace;
		font-size: 0.8rem;
		padding: 0.5rem;
		border: 1px solid #d8dce8;
		border-radius: 6px;
		box-sizing: border-box;
		resize: vertical;
		background: #fafbff;
	}

	.error-box {
		padding: 0.6rem 0.75rem;
		background: #fff0f0;
		color: #dc2626;
		border-radius: 6px;
		font-size: 0.8rem;
		margin-bottom: 1rem;
		border: 1px solid #ffd0d0;
	}

	.empty-hint {
		color: #aaa;
		font-size: 0.875rem;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

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
</style>
