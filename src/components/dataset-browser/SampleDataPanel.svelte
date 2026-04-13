<script lang="ts">
	interface Props {
		isOpen: boolean;
		iframeSrc: string;
		onToggle: () => void;
	}

	let { isOpen, iframeSrc, onToggle }: Props = $props();
	let iframeHasLoaded = $state(false);
	let iframeLoadError = $state<string | null>(null);

	$effect(() => {
		iframeSrc;
		iframeHasLoaded = false;
		iframeLoadError = null;
	});

	function handleIframeLoad(): void {
		iframeHasLoaded = true;
		iframeLoadError = null;
	}

	function handleIframeError(): void {
		iframeHasLoaded = false;
		iframeLoadError = 'The sample data viewer failed to load. Try selecting another dataset or reloading the page.';
	}
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
				<iframe
					src={iframeSrc}
					onload={handleIframeLoad}
					onerror={handleIframeError}
					sandbox="allow-scripts allow-same-origin allow-forms"
					referrerpolicy="strict-origin-when-cross-origin"
					class="w-full overflow-hidden border-0 {iframeHasLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity"
					style="height: 560px; min-height: 560px;"
					title="Data Table Widget"
					loading="lazy"
				></iframe>
				{#if !iframeHasLoaded && !iframeLoadError}
					<div class="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-slate-600" role="status" aria-live="polite">
						Loading sample data viewer…
					</div>
				{/if}
				{#if iframeLoadError}
					<div class="absolute inset-0 flex items-center justify-center bg-white p-6">
						<p role="alert" class="max-w-md rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
							{iframeLoadError}
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</section>
