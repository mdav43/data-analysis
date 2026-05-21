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
		<span class="drop-icon">📂</span>
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
			<div class="spinner"></div>
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
		gap: 1rem;
	}

	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 2rem 1rem;
		border: 2px dashed #b0b8d0;
		border-radius: 10px;
		cursor: pointer;
		transition: border-color 0.2s, background-color 0.2s;
		background: #fafbff;
		color: #555;
		text-align: center;
	}

	.drop-zone:hover,
	.drag-over {
		border-color: #4f8ef7;
		background: #f0f4ff;
	}

	.file-input {
		display: none;
	}

	.drop-icon {
		font-size: 2rem;
		line-height: 1;
	}

	.drop-text {
		font-size: 0.95rem;
	}

	.error-box {
		padding: 0.75rem 1rem;
		background: #fff0f0;
		border: 1px solid #ffaaaa;
		border-radius: 6px;
		color: #c0392b;
		font-size: 0.9rem;
	}

	.loading-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: #4f5b7a;
		font-size: 0.9rem;
	}

	.spinner {
		width: 18px;
		height: 18px;
		border: 2px solid #c0caff;
		border-top-color: #4f8ef7;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.preview {
		background: #fafbff;
		border: 1px solid #e0e4f0;
		border-radius: 8px;
		padding: 1rem 1.25rem;
	}

	.preview-title {
		margin: 0 0 0.75rem;
		font-size: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.row-badge {
		background: #e8eeff;
		color: #4f5b9a;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 0.2em 0.6em;
		border-radius: 99px;
	}

	.preview h4 {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin: 1rem 0 0.4rem;
	}

	.schema-table,
	.sample-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.schema-table th,
	.schema-table td,
	.sample-table th,
	.sample-table td {
		text-align: left;
		padding: 0.35rem 0.6rem;
		border-bottom: 1px solid #eaecf4;
	}

	.schema-table th,
	.sample-table th {
		background: #f0f3fb;
		font-weight: 600;
		color: #333;
	}

	.type-cell {
		color: #6b6bcc;
		font-family: monospace;
		font-size: 0.82rem;
	}

	.sample-wrapper {
		overflow-x: auto;
		border-radius: 6px;
		border: 1px solid #e0e4f0;
	}
</style>
