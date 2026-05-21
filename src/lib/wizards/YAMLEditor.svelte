<script lang="ts">
	import { configYaml, yamlError, applyYaml } from '$lib/state/wizard';

	let editorText = '';
	let isDirty = false;

	$: if (!isDirty) editorText = $configYaml;

	function handleInput(e: Event) {
		editorText = (e.target as HTMLTextAreaElement).value;
		isDirty = true;
	}

	function handleApply() {
		const ok = applyYaml(editorText);
		if (ok) isDirty = false;
	}

	function handleReset() {
		editorText = $configYaml;
		isDirty = false;
		yamlError.set(null);
	}
</script>

<div class="yaml-editor">
	<div class="toolbar">
		<span class="title">YAML Config</span>
		<div class="actions">
			{#if isDirty}
				<button class="btn-apply" on:click={handleApply}>Apply</button>
				<button class="btn-reset" on:click={handleReset}>Reset</button>
			{/if}
		</div>
	</div>
	<textarea
		class="editor"
		value={editorText}
		on:input={handleInput}
		spellcheck="false"
		placeholder="# Paste or edit YAML config here"
	></textarea>
	{#if $yamlError}
		<div class="parse-error">{$yamlError}</div>
	{/if}
</div>

<style>
	.yaml-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		border: 1px solid #e8eaf0;
		border-radius: 8px;
		overflow: hidden;
	}

	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.4rem 0.75rem;
		background: #f8f9fc;
		border-bottom: 1px solid #e8eaf0;
		flex-shrink: 0;
	}

	.title {
		font-size: 0.7rem;
		font-weight: 700;
		color: #999;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.actions {
		display: flex;
		gap: 0.4rem;
	}

	button {
		font-size: 0.75rem;
		padding: 0.2rem 0.55rem;
		border-radius: 4px;
		cursor: pointer;
		border: 1px solid transparent;
	}

	.btn-apply {
		background: #4f8ef7;
		color: white;
		border-color: #3a7ae8;
	}
	.btn-apply:hover {
		background: #3a7ae8;
	}

	.btn-reset {
		background: white;
		color: #666;
		border-color: #ddd;
	}
	.btn-reset:hover {
		background: #f5f5f5;
	}

	.editor {
		flex: 1;
		width: 100%;
		font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
		font-size: 0.72rem;
		line-height: 1.6;
		padding: 0.75rem;
		border: none;
		resize: none;
		outline: none;
		color: #1a1a2e;
		background: #fafbff;
		box-sizing: border-box;
	}

	.parse-error {
		padding: 0.5rem 0.75rem;
		background: #fff0f0;
		color: #dc2626;
		font-size: 0.72rem;
		border-top: 1px solid #ffaaaa;
		flex-shrink: 0;
	}
</style>
