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
		overflow: hidden;
	}

	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--sp-3) var(--sp-6);
		background: var(--surface-2);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		min-height: 36px;
	}

	.title {
		font-family: var(--font-mono);
		font-size: var(--fs-10);
		font-weight: 500;
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.actions {
		display: flex;
		gap: var(--sp-3);
	}

	button {
		height: 22px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-2);
		cursor: pointer;
		font-family: var(--font-sans);
		font-size: var(--fs-11);
		font-weight: 500;
		border: 1px solid transparent;
	}

	.btn-apply {
		background: var(--accent);
		color: var(--accent-fg);
		border-color: var(--accent);
	}
	.btn-apply:hover { background: var(--accent-hover); }

	.btn-reset {
		background: var(--surface);
		color: var(--fg-muted);
		border-color: var(--border-strong);
	}
	.btn-reset:hover { background: var(--surface-hover); }

	.editor {
		flex: 1;
		width: 100%;
		font-family: var(--font-mono);
		font-size: var(--fs-11);
		line-height: var(--lh-normal);
		padding: var(--sp-6);
		border: none;
		resize: none;
		outline: none;
		color: var(--fg);
		background: var(--bg-subtle);
		box-sizing: border-box;
	}
	.editor::placeholder { color: var(--fg-faint); }

	.parse-error {
		padding: var(--sp-4) var(--sp-6);
		background: var(--danger-bg);
		color: var(--danger-text);
		font-family: var(--font-mono);
		font-size: var(--fs-11);
		border-top: 1px solid var(--danger);
		flex-shrink: 0;
	}
</style>
