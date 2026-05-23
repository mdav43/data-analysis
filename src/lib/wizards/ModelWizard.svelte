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
	<div class="eyebrow" style="margin-bottom:var(--sp-3)">Step 02</div>
	<h2 class="step-heading">Model</h2>
	<p class="step-sub">Select a base table and optionally join another table.</p>

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
	.wizard-step { max-width: 560px; }

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

	.opt { font-weight: normal; color: var(--fg-faint); }

	select,
	input[type='text'] {
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
	select:focus, input:focus {
		outline: 1px solid var(--accent);
		outline-offset: -1px;
		border-color: var(--accent);
	}

	.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-6); }

	.sql-editor {
		width: 100%;
		font-family: var(--font-mono);
		font-size: var(--fs-11);
		line-height: var(--lh-normal);
		padding: var(--sp-4) var(--sp-5);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-2);
		box-sizing: border-box;
		resize: vertical;
		background: var(--bg-subtle);
		color: var(--fg);
	}
	.sql-editor:focus { outline: 1px solid var(--accent); outline-offset: -1px; border-color: var(--accent); }

	.error-box {
		padding: var(--sp-4) var(--sp-5);
		background: var(--danger-bg);
		color: var(--danger-text);
		border-radius: var(--r-2);
		font-family: var(--font-mono);
		font-size: var(--fs-11);
		margin-bottom: var(--sp-6);
		border: 1px solid var(--danger);
	}

	.empty-hint {
		font-family: var(--font-mono);
		font-size: var(--fs-12);
		color: var(--fg-muted);
	}

	.actions {
		display: flex;
		gap: var(--sp-4);
		justify-content: flex-end;
		margin-top: var(--sp-8);
	}
</style>
