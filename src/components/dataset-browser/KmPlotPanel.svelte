<script lang="ts">
	import { getEndpointFullName } from '../../lib/dataset-utils';
	import type { SurvivalEndpoint } from '../../types/dataset';
	import geneDescriptions from '../../data/gene_symbol_descriptions.json';

	const geneDescriptionMap: Record<string, string> = geneDescriptions;

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
	let filteredGenes = $derived(
		geneFilter.trim() === ''
			? candidateGenes
			: candidateGenes.filter((g) => {
					const q = geneFilter.trim().toLowerCase();
					return g.toLowerCase().includes(q) ||
						(geneDescriptionMap[g]?.toLowerCase().includes(q) ?? false);
				})
	);

	function handleGeneSelect(gene: string): void {
		onSelectGene(gene);
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

	function scrollToSelectedGene(): void {
		if (!candidateGenesListEl || !selectedCandidateGene) return;
		const selected = candidateGenesListEl.querySelector('[aria-pressed="true"]');
		if (selected) {
			selected.scrollIntoView({ block: 'center' });
		}
	}

	let prevGeneFilter = '';
	$effect(() => {
		const current = geneFilter.trim();
		const wasFiltering = prevGeneFilter !== '';
		const isNowEmpty = current === '';
		prevGeneFilter = current;

		if (wasFiltering && isNowEmpty) {
			requestAnimationFrame(() => {
				scrollToSelectedGene();
				updateCandidateGenesScrollAffordance();
			});
		}
	});

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
</script>

<svelte:window onresize={updateCandidateGenesScrollAffordance} />

<section data-tour="km-analysis">
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
			<div class="relative grid bg-white md:h-[800px] md:grid-cols-[340px_minmax(0,1fr)]">
				<aside class="flex min-h-0 flex-col overflow-hidden border-b border-r border-slate-200 bg-slate-50 p-3 md:border-b-0">
					{#if endpoints.length > 0 && getEndpointKey && onSelectEndpoint}
						<div data-tour="km-survival-endpoints" class="mb-3 pb-3 border-b border-slate-200/80">
							<p class="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Survival Endpoint</p>
							<div class="flex flex-col">
								{#each endpoints as endpoint (getEndpointKey(endpoint))}
									{@const key = getEndpointKey(endpoint)}
									<button
										type="button"
										aria-pressed={activeEndpointKey === key}
										onclick={() => onSelectEndpoint(key)}
										class="w-full rounded-r-md border-l-[3px] px-2.5 py-1.5 text-left text-[13px] outline-none transition-all duration-150 focus-visible:ring-1 focus-visible:ring-slate-400 focus-visible:ring-offset-1 {activeEndpointKey === key
											? 'border-l-slate-700 bg-white font-semibold text-slate-900 shadow-sm'
											: 'border-l-transparent text-slate-500 hover:border-l-slate-300 hover:bg-white/60 hover:text-slate-700'}"
									>
										{getEndpointFullName(endpoint.abbrv)} ({endpoint.abbrv})
									</button>
								{/each}
							</div>
						</div>
					{/if}
					<div data-tour="km-candidate-genes" class="flex min-h-0 flex-col md:flex-1">
						<div class="flex items-center gap-1.5">
							<p class="text-xs font-bold uppercase tracking-wider text-slate-500">Genes</p>
							<span class="group relative inline-flex">
								<button
									type="button"
									class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold leading-none text-slate-500 transition-colors hover:border-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-50"
									aria-label="How genes are selected"
									aria-describedby="candidate-genes-help"
								>
									i
								</button>
								<span
									id="candidate-genes-help"
									role="tooltip"
									class="pointer-events-none absolute left-0 top-full z-10 mt-2 w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
								>
									Candidate genes represent the top 100 genes ranked by univariate Cox regression. For the selected gene, samples are stratified at the median expression into low- and high-expression groups.
								</span>
							</span>
						</div>
						<div class="mt-2 flex min-h-0 max-h-60 flex-col md:max-h-none md:flex-1">
						<div class="relative">
							<svg class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
							</svg>
							<input
								type="text"
								bind:value={geneFilter}
								placeholder="Search genes…"
								class="w-full rounded border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
								aria-label="Search genes"
							/>
						</div>
						<div class="relative mt-1 min-h-0 flex-1 overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
							{#if candidateGenes.length > 0}
								{#if filteredGenes.length > 0}
									<ul
										bind:this={candidateGenesListEl}
										onscroll={updateCandidateGenesScrollAffordance}
										role="list"
										aria-label="Genes"
										class="h-full overflow-y-auto"
									>
										{#each filteredGenes as gene (gene)}
											<li class="border-b border-slate-100 last:border-b-0">
												<button
													type="button"
													aria-pressed={selectedCandidateGene === gene}
													onclick={() => handleGeneSelect(gene)}
													class="block w-full px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 {selectedCandidateGene === gene
														? 'bg-neutral-800 text-white'
														: 'bg-transparent text-slate-700 hover:bg-slate-100/70'}"
													title="{gene}{geneDescriptionMap[gene] ? ` — ${geneDescriptionMap[gene]}` : ''}"
												>
													<span class="block break-all text-sm font-medium leading-5">{gene}</span>
												{#if geneDescriptionMap[gene]}
													<span class="block text-xs leading-4 {selectedCandidateGene === gene
														? 'text-neutral-300'
														: 'text-slate-400'}"
													>
														{geneDescriptionMap[gene]}
													</span>
												{/if}
												</button>
											</li>
										{/each}
									</ul>
									{#if canScrollCandidateGenesUp}
										<div class="pointer-events-none absolute left-0 right-0 top-0 h-6 bg-gradient-to-b from-white/85 via-white/45 to-transparent"></div>
									{/if}
									{#if canScrollCandidateGenesDown}
										<div class="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white/85 via-white/45 to-transparent"></div>
									{/if}
								{:else}
									<p class="px-3 py-3 text-sm italic text-slate-400">No genes matching "{geneFilter}"</p>
								{/if}
							{:else}
								<p class="px-3 py-3 text-sm italic text-slate-400">No genes available for this dataset.</p>
							{/if}
						</div>
						</div>
					</div>
				</aside>
				<div data-tour="km-plot" class="relative">
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
				</div>
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
