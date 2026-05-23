<script lang="ts">
	import { initDuckDB, query, registerFileBuffer, isDuckDBReady } from '$lib/duck/index.js';
	import { getTableSchema, getRowCount, getSampleRows } from '$lib/duck/schema.js';
	import type { SourceConfig, SchemaPreview } from '$lib/types';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher<{ connect: SourceConfig }>();

	let dragOver = false;
	let status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
	let errorMsg = '';
	let preview: SchemaPreview | null = null;
	let sourceConfig: SourceConfig | null = null;
	let fileInput: HTMLInputElement;

	/** Sanitise a filename to a safe SQL table name. */
	function toTableName(filename: string): string {
		return filename
			.replace(/\.csv$/i, '')
			.replace(/[^a-zA-Z0-9_]/g, '_')
			.replace(/^(\d)/, '_$1');
	}

	async function handleFile(file: File) {
		if (!file.name.toLowerCase().endsWith('.csv')) {
			errorMsg = 'Only .csv files are supported.';
			status = 'error';
			return;
		}

		status = 'loading';
		errorMsg = '';
		preview = null;
		sourceConfig = null;

		try {
			// Make sure DuckDB is ready
			if (!isDuckDBReady()) {
				await initDuckDB();
			}

			const buffer = new Uint8Array(await file.arrayBuffer());
			const tableName = toTableName(file.name);

			// Register file buffer with DuckDB
			await registerFileBuffer(file.name, buffer);

			// Create (or replace) table from CSV
			await query(
				`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${file.name}')`
			);

			// Introspect schema
			const [columns, rowCount, sampleRows] = await Promise.all([
				getTableSchema(tableName),
				getRowCount(tableName),
				getSampleRows(tableName, 5)
			]);

			preview = { tableName, columns, rowCount, sampleRows };

			sourceConfig = {
				kind: 'source',
				name: tableName,
				type: 'csv',
				file: file.name
			};

			dispatch('connect', sourceConfig);
			status = 'ready';
		} catch (e) {
			errorMsg = String(e);
			status = 'error';
			console.error('ConnectData error:', e);
		}
	}

	function onInputChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) handleFile(file);
		// Reset so the same file can be re-selected
		input.value = '';
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		const file = event.dataTransfer?.files[0];
		if (file) handleFile(file);
	}

	function onDragOver(event: DragEvent) {
		event.preventDefault();
		dragOver = true;
	}

	function onDragLeave() {
		dragOver = false;
	}
</script>

<div class="connect-data">
	<!-- Drop zone -->
	<!-- svelte-ignore a11y-interactive-supports-focus -->
	<div
		class="drop-zone"
		class:drag-over={dragOver}
		on:drop={onDrop}
		on:dragover={onDragOver}
		on:dragleave={onDragLeave}
		role="button"
		tabindex="0"
		on:click={() => fileInput.click()}
		on:keydown={(e) => e.key === 'Enter' && fileInput.click()}
		aria-label="Upload CSV file — drag and drop or click to browse"
	>
		<input bind:this={fileInput} type="file" accept=".csv" on:change={onInputChange} class="file-input" />
		<span class="drop-icon">⬆</span>
		<span class="drop-text">
			{#if status === 'loading'}
				Processing…
			{:else}
				Drag &amp; drop a CSV file, or <strong>click to browse</strong>
			{/if}
		</span>
	</div>

	<!-- Error -->
	{#if status === 'error'}
		<div class="error-box" role="alert">
			<strong>Error:</strong> {errorMsg}
		</div>
	{/if}

	<!-- Loading spinner -->
	{#if status === 'loading'}
		<div class="loading-row" role="status">
			<span class="dl-spinner"></span>
			<span>Registering file and reading schema…</span>
		</div>
	{/if}

	<!-- Schema preview -->
	{#if status === 'ready' && preview}
		<div class="preview">
			<h3 class="preview-title">
				Table: <code>{preview.tableName}</code>
				<span class="row-badge">{preview.rowCount.toLocaleString()} rows</span>
			</h3>

			<!-- Column schema -->
			<h4>Columns</h4>
			<table class="schema-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
					</tr>
				</thead>
				<tbody>
					{#each preview.columns as col}
						<tr>
							<td><code>{col.name}</code></td>
							<td class="type-cell">{col.type}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<!-- Sample data -->
			{#if preview.sampleRows.length > 0}
				<h4>Sample rows (up to 5)</h4>
				<div class="sample-wrapper">
					<table class="sample-table">
						<thead>
							<tr>
								{#each preview.columns as col}
									<th>{col.name}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each preview.sampleRows as row}
								<tr>
									{#each preview.columns as col}
										<td>{row[col.name] ?? ''}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.connect-data {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}

	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-10) var(--sp-7);
		border: 1.5px dashed var(--border-strong);
		border-radius: var(--r-3);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
		background: var(--bg-subtle);
		color: var(--fg-muted);
		text-align: center;
	}

	.drop-zone:hover,
	.drag-over {
		border-color: var(--accent);
		background: var(--accent-bg);
		color: var(--accent-text);
	}

	.file-input { display: none; }

	.drop-icon { font-size: 1.5rem; line-height: 1; }

	.drop-text {
		font-family: var(--font-mono);
		font-size: var(--fs-12);
	}

	.error-box {
		padding: var(--sp-4) var(--sp-6);
		background: var(--danger-bg);
		border: 1px solid var(--danger);
		border-radius: var(--r-2);
		color: var(--danger-text);
		font-family: var(--font-mono);
		font-size: var(--fs-11);
	}

	.loading-row {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		color: var(--fg-muted);
		font-family: var(--font-mono);
		font-size: var(--fs-12);
	}

	.preview {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--r-3);
		overflow: hidden;
	}

	.preview-title {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		flex-wrap: wrap;
		padding: var(--sp-4) var(--sp-6);
		border-bottom: 1px solid var(--border);
		margin: 0;
	}

	.preview-title code {
		font-family: var(--font-mono);
		font-size: var(--fs-13);
		font-weight: 500;
		color: var(--fg);
	}

	.preview h4 {
		font-family: var(--font-mono);
		font-size: var(--fs-10);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--fg-subtle);
		margin: 0;
		padding: var(--sp-5) var(--sp-6) var(--sp-3);
	}

	.schema-table,
	.sample-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-12);
	}

	.schema-table th,
	.schema-table td,
	.sample-table th,
	.sample-table td {
		text-align: left;
		padding: 6px var(--sp-6);
		border-bottom: 1px solid var(--divider);
	}

	.schema-table th,
	.sample-table th {
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: var(--fs-10);
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--fg-subtle);
		border-bottom: 1px solid var(--border);
	}

	.type-cell {
		color: var(--t-id);
		font-family: var(--font-mono);
		font-size: var(--fs-11);
	}

	.sample-wrapper {
		overflow-x: auto;
	}
</style>
