<script lang="ts">
	import { onDestroy } from 'svelte';
	import { getEndpointFullName } from '../../lib/dataset-utils';
	import type { SurvivalEndpoint } from '../../types/dataset';

	interface Props {
		isOpen: boolean;
		kmWidgetIframeSrc: string;
		candidateGenes: string[];
		selectedCandidateGene: string | null;
		onToggleOpen: () => void;
		onSelectGene: (gene: string) => void;
		endpoints?: SurvivalEndpoint[];
		activeEndpointKey?: string | null;
		onSelectEndpoint?: (endpointKey: string) => void;
		getEndpointKey?: (endpoint: SurvivalEndpoint) => string;
	}

	let {
		isOpen,
		kmWidgetIframeSrc,
		candidateGenes,
		selectedCandidateGene,
		onToggleOpen,
		onSelectGene,
		endpoints = [],
		activeEndpointKey = null,
		onSelectEndpoint,
		getEndpointKey,
	}: Props = $props();

	let geneFilter = $state('');
	let isListOpen = $state(false);
	let filteredGenes = $derived(
		geneFilter.trim() === ''
			? candidateGenes
			: candidateGenes.filter((g) =>
					g.toLowerCase().includes(geneFilter.trim().toLowerCase())
				)
	);

	let inputEl = $state<HTMLInputElement | null>(null);
	let geneChooserEl = $state<HTMLDivElement | null>(null);
	let blurCloseTimeoutId: ReturnType<typeof setTimeout> | null = null;

	function clearBlurCloseTimeout(): void {
		if (blurCloseTimeoutId !== null) {
			clearTimeout(blurCloseTimeoutId);
			blurCloseTimeoutId = null;
		}
	}

	function handleFilterFocus(): void {
		clearBlurCloseTimeout();
		geneFilter = '';
		isListOpen = true;
	}

	function handleChooserFocusIn(): void {
		clearBlurCloseTimeout();
		isListOpen = true;
	}

	function scheduleChooserClose(): void {
		clearBlurCloseTimeout();
		blurCloseTimeoutId = setTimeout(() => {
			blurCloseTimeoutId = null;
			isListOpen = false;
			geneFilter = '';
		}, 150);
	}

	function isFocusInsideChooser(nextFocusTarget: EventTarget | null): boolean {
		return nextFocusTarget instanceof Node && geneChooserEl?.contains(nextFocusTarget) === true;
	}

	function handleChooserFocusOut(event: FocusEvent): void {
		if (isFocusInsideChooser(event.relatedTarget)) {
			clearBlurCloseTimeout();
			isListOpen = true;
			return;
		}

		scheduleChooserClose();
	}

	function handleGeneSelect(gene: string): void {
		clearBlurCloseTimeout();
		onSelectGene(gene);
		geneFilter = '';
		isListOpen = false;
		inputEl?.blur();
	}

	let candidateGenesListEl = $state<HTMLUListElement | null>(null);
	let canScrollCandidateGenesUp = $state(false);
	let canScrollCandidateGenesDown = $state(false);
	let kmWidgetHasLoaded = $state(false);
	let kmWidgetLoadError = $state<string | null>(null);

	function updateCandidateGenesScrollAffordance(): void {
		if (!candidateGenesListEl) {
			canScrollCandidateGenesUp = false;
			canScrollCandidateGenesDown = false;
			return;
		}

		const { scrollTop, scrollHeight, clientHeight } = candidateGenesListEl;
		const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
		canScrollCandidateGenesUp = scrollTop > 2;
		canScrollCandidateGenesDown = maxScrollTop - scrollTop > 2;
	}

	$effect(() => {
		candidateGenes.length;
		filteredGenes.length;
		selectedCandidateGene;
		requestAnimationFrame(() => updateCandidateGenesScrollAffordance());
	});

	$effect(() => {
		candidateGenes;
		geneFilter = '';
	});

	$effect(() => {
		kmWidgetIframeSrc;
		kmWidgetHasLoaded = false;
		kmWidgetLoadError = null;
	});

	function handleKmWidgetLoad(): void {
		kmWidgetHasLoaded = true;
		kmWidgetLoadError = null;
	}

	function handleKmWidgetError(): void {
		kmWidgetHasLoaded = false;
		kmWidgetLoadError = 'The Kaplan-Meier plot failed to load. Try selecting another dataset or reloading the page.';
	}

	onDestroy(() => clearBlurCloseTimeout());
</script>

<svelte:window onresize={updateCandidateGenesScrollAffordance} />

<section>
	<button
		onclick={onToggleOpen}
		aria-expanded={isOpen}
		aria-controls="km-plot-panel-content"
		class="mb-3 flex w-full items-center gap-2 cursor-pointer text-left text-slate-600 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
	>
		<svg class="h-4 w-4 text-slate-400 {isOpen ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
		</svg>
		<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Kaplan-Meier plot</h3>
	</button>
	{#if isOpen}
		<div id="km-plot-panel-content">
		<div class="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
			<div class="relative grid bg-white md:h-[800px] md:grid-cols-[280px_minmax(0,1fr)]">
				<aside class="flex min-h-0 flex-col overflow-hidden border-b border-r border-slate-200 bg-slate-50 p-3 md:border-b-0">
					{#if endpoints.length > 0 && getEndpointKey && onSelectEndpoint}
						<div class="mb-2 pb-2 border-b border-slate-200">
							<p class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Survival Endpoint</p>
							<div class="flex flex-col">
								{#each endpoints as endpoint (getEndpointKey(endpoint))}
									{@const key = getEndpointKey(endpoint)}
									<button
										type="button"
										aria-pressed={activeEndpointKey === key}
										onclick={() => onSelectEndpoint(key)}
										class="w-full rounded-r-md border-l-[3px] px-2.5 py-1.5 text-left text-[13px] outline-none transition-all duration-150 focus-visible:ring-1 focus-visible:ring-slate-400 focus-visible:ring-offset-1 {activeEndpointKey === key
											? 'border-l-slate-600 bg-slate-100 font-medium text-slate-900'
											: 'border-l-transparent text-slate-500 hover:border-l-slate-300 hover:bg-slate-100/60 hover:text-slate-700'}"
									>
										{getEndpointFullName(endpoint.abbrv)} ({endpoint.abbrv})
									</button>
								{/each}
							</div>
						</div>
					{/if}
					<div class="flex items-center gap-1.5">
						<p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Candidate genes</p>
						<span class="group relative inline-flex">
							<button
								type="button"
								class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold leading-none text-slate-500 transition-colors hover:border-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50"
								aria-label="How candidate genes are selected"
								aria-describedby="candidate-genes-help"
							>
								i
							</button>
							<span
								id="candidate-genes-help"
								role="tooltip"
								class="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
							>
								Genes are selected by filtering with univariate Cox regression analysis. The plot shows two patient groups split by the median value of gene expression.
							</span>
						</span>
					</div>
					<div
						bind:this={geneChooserEl}
						class="mt-2"
						onfocusin={handleChooserFocusIn}
						onfocusout={handleChooserFocusOut}
					>
						<div class="relative">
							<input
								bind:this={inputEl}
								type="text"
								bind:value={geneFilter}
								placeholder={selectedCandidateGene ?? 'Search genes…'}
								onfocus={handleFilterFocus}
								class="w-full rounded border border-slate-300 bg-white py-1.5 pl-2.5 pr-7 text-sm text-slate-700 placeholder:font-medium placeholder:text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:placeholder:text-slate-400 focus:placeholder:font-normal"
								aria-label="Search candidate genes"
							/>
							<svg class="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 10l5 5 5-5"></path>
							</svg>
						</div>
						{#if isListOpen || geneFilter.trim() !== ''}
							<div class="relative mt-1 min-h-0 max-h-72 overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
								{#if candidateGenes.length > 0}
									{#if filteredGenes.length > 0}
										<ul
											bind:this={candidateGenesListEl}
											onscroll={updateCandidateGenesScrollAffordance}
											role="list"
											aria-label="Candidate Genes"
											class="max-h-72 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgb(148_163_184)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/60 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500/70 [&::-webkit-scrollbar-track]:bg-transparent"
										>
											{#each filteredGenes as gene (gene)}
												<li class="border-b border-slate-100 last:border-b-0">
													<button
														type="button"
														aria-pressed={selectedCandidateGene === gene}
														onclick={() => handleGeneSelect(gene)}
														class="block w-full px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 {selectedCandidateGene === gene
															? 'bg-neutral-800 text-white'
															: 'bg-transparent text-slate-700 hover:bg-slate-100/70'}"
														title={gene}
													>
														<span class="block break-all leading-5">{gene}</span>
													</button>
												</li>
											{/each}
										</ul>
										{#if canScrollCandidateGenesUp}
											<div class="pointer-events-none absolute left-0 right-0 top-0 h-6 bg-gradient-to-b from-white/85 via-white/45 to-transparent"></div>
										{/if}
										{#if canScrollCandidateGenesDown}
											<div class="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white/85 via-white/45 to-transparent"></div>
											<div class="pointer-events-none absolute bottom-1.5 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow-sm ring-1 ring-slate-200/70">
												<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 10l5 5 5-5"></path>
												</svg>
											</div>
										{/if}
									{:else}
										<p class="px-3 py-3 text-sm italic text-slate-400">No genes matching "{geneFilter}"</p>
									{/if}
								{/if}
								{#if candidateGenes.length === 0}
									<p class="px-3 py-3 text-sm italic text-slate-400">No candidate genes available for this dataset.</p>
								{/if}
							</div>
						{/if}
					</div>
				</aside>
				<iframe
					src={kmWidgetIframeSrc}
					onload={handleKmWidgetLoad}
					onerror={handleKmWidgetError}
					sandbox="allow-scripts allow-same-origin allow-forms"
					referrerpolicy="strict-origin-when-cross-origin"
					class="w-full overflow-hidden border-0 {kmWidgetHasLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity"
					style="height: 800px; min-height: 800px;"
					title="Kaplan Meier Plot"
					loading="lazy"
				></iframe>
				{#if !kmWidgetHasLoaded && !kmWidgetLoadError}
					<div class="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-slate-600" role="status" aria-live="polite">
						Loading Kaplan-Meier plot…
					</div>
				{/if}
				{#if kmWidgetLoadError}
					<div class="absolute inset-0 flex items-center justify-center bg-white p-6">
						<p role="alert" class="max-w-md rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
							{kmWidgetLoadError}
						</p>
					</div>
				{/if}
			</div>
		</div>
		</div>
	{/if}
</section>
