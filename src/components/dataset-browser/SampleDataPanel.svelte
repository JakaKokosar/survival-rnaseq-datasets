<script lang="ts">
	interface Props {
		isOpen: boolean;
		onToggle: () => void;
	}

	let { isOpen, onToggle }: Props = $props();
</script>

<section data-tour="sample-data-viewer">
	<button
		onclick={onToggle}
		aria-expanded={isOpen}
		aria-controls="sample-data-panel-content"
		class="mb-3 flex w-full items-center gap-2 cursor-pointer text-left text-slate-600 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
	>
		<svg
			class="h-4 w-4 text-slate-400 {isOpen ? 'rotate-90' : ''}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
		</svg>
		<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Sample data viewer</h3>
	</button>
	{#if isOpen}
		<div id="sample-data-panel-content">
			<div class="relative overflow-hidden rounded-lg border border-slate-200 shadow-sm">
				<div class="h-[560px] min-h-[560px] w-full bg-white" aria-label="Sample data viewer placeholder"></div>
			</div>
		</div>
	{/if}
</section>
