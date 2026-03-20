<script lang="ts">
	import {
		formatEventValues,
		getEndpointCardBorderClass,
		getEndpointFullName,
		isEndpointIncomplete,
	} from '../../lib/dataset-utils';
	import type { Dataset } from '../../types/dataset';

	type Endpoint = Dataset['survival-endpoints'][number];

	interface Props {
		datasetId: string;
		endpoints: Endpoint[];
		expanded?: boolean;
		isOpen?: boolean;
		isDesktop?: boolean;
		selectedEndpointKey?: string | null;
		onToggleOpen?: () => void;
		onSelectEndpoint?: (endpointKey: string) => void;
		getEndpointKey: (endpoint: Endpoint) => string;
		isCompleteEndpoint: (endpoint: Endpoint) => boolean;
	}

	let {
		datasetId,
		endpoints,
		expanded = false,
		isOpen = true,
		isDesktop = true,
		selectedEndpointKey = null,
		onToggleOpen,
		onSelectEndpoint,
		getEndpointKey,
		isCompleteEndpoint,
	}: Props = $props();

	let endpointsScrollerEl = $state<HTMLDivElement | null>(null);
	let openNotes = $state(new Set<number>());
	let notesCanScrollUp = $state(new Set<number>());
	let notesCanScrollDown = $state(new Set<number>());
	let canScrollEndpointsLeft = $state(false);
	let canScrollEndpointsRight = $state(false);

	function updateEndpointsScrollAffordance(): void {
		if (!endpointsScrollerEl || !isDesktop) {
			canScrollEndpointsLeft = false;
			canScrollEndpointsRight = false;
			return;
		}

		const { scrollLeft, scrollWidth, clientWidth } = endpointsScrollerEl;
		const maxScroll = Math.max(0, scrollWidth - clientWidth);
		canScrollEndpointsLeft = scrollLeft > 2;
		canScrollEndpointsRight = maxScroll - scrollLeft > 2;
	}

	function updateNotesScrollAffordanceForIndex(idx: number, element: HTMLDivElement | null): void {
		if (!element || !openNotes.has(idx)) {
			const nextUp = new Set(notesCanScrollUp);
			nextUp.delete(idx);
			notesCanScrollUp = nextUp;

			const nextDown = new Set(notesCanScrollDown);
			nextDown.delete(idx);
			notesCanScrollDown = nextDown;
			return;
		}

		const { scrollTop, scrollHeight, clientHeight } = element;
		const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
		const canUp = scrollTop > 2;
		const canDown = maxScrollTop - scrollTop > 2;

		const nextUp = new Set(notesCanScrollUp);
		if (canUp) nextUp.add(idx);
		else nextUp.delete(idx);
		notesCanScrollUp = nextUp;

		const nextDown = new Set(notesCanScrollDown);
		if (canDown) nextDown.add(idx);
		else nextDown.delete(idx);
		notesCanScrollDown = nextDown;
	}

	function toggleNotes(idx: number): void {
		const next = new Set(openNotes);
		if (next.has(idx)) next.delete(idx);
		else next.add(idx);
		openNotes = next;
		requestAnimationFrame(() => {
			const notesEl = document.getElementById(`endpoint-notes-body-${datasetId}-${idx}`) as HTMLDivElement | null;
			updateNotesScrollAffordanceForIndex(idx, notesEl);
		});
	}

	$effect(() => {
		datasetId;
		openNotes = new Set();
		notesCanScrollUp = new Set();
		notesCanScrollDown = new Set();
		if (endpointsScrollerEl) {
			endpointsScrollerEl.scrollLeft = 0;
			requestAnimationFrame(() => updateEndpointsScrollAffordance());
		}
	});

	$effect(() => {
		isOpen;
		isDesktop;
		endpoints.length;
		requestAnimationFrame(() => updateEndpointsScrollAffordance());
	});

	$effect(() => {
		openNotes;
		requestAnimationFrame(() => {
			openNotes.forEach((idx) => {
				const notesEl = document.getElementById(
					`endpoint-notes-body-${datasetId}-${idx}`,
				) as HTMLDivElement | null;
				updateNotesScrollAffordanceForIndex(idx, notesEl);
			});
		});
	});
</script>

<svelte:window
	onresize={() => {
		updateEndpointsScrollAffordance();
		openNotes.forEach((idx) => {
			const notesEl = document.getElementById(`endpoint-notes-body-${datasetId}-${idx}`) as HTMLDivElement | null;
			updateNotesScrollAffordanceForIndex(idx, notesEl);
		});
	}}
/>

{#if expanded}
<section>
	<div class="space-y-4">
		{#each endpoints as endpoint, epIndex (`${getEndpointKey(endpoint)}-${epIndex}`)}
			<div class="rounded-lg border {getEndpointCardBorderClass(endpoint)} {isEndpointIncomplete(endpoint) ? 'bg-slate-50 opacity-60' : 'bg-white'} p-4 shadow-sm">
				<div class="mb-3 flex items-center gap-2">
					{#if endpoint.abbrv}
						<span class="inline-flex items-center rounded bg-neutral-800 px-2 py-0.5 text-xs font-bold text-white">{endpoint.abbrv}</span>
					{/if}
					<span class="text-base font-medium text-slate-900">{getEndpointFullName(endpoint.abbrv)}</span>
					{#if isEndpointIncomplete(endpoint)}
						<span class="ml-auto text-xs italic text-slate-400">Incomplete</span>
					{/if}
				</div>

				<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2 text-sm">
					{#if endpoint.time_var.var_name === 'unknown'}
						<dt class="text-slate-600">Time:</dt>
						<dd class="italic text-slate-400">Not documented</dd>
					{:else}
						<dt class="text-slate-600">Time:</dt>
						<dd>
							<span class="font-mono text-xs text-slate-900">{endpoint.time_var.var_name}</span>{#if endpoint.time_var.var_unit !== 'unknown'}{' '}<span class="text-slate-600">({endpoint.time_var.var_unit})</span>{/if}
						</dd>
					{/if}

					{#if endpoint.event_var.var_name === 'unknown'}
						<dt class="text-slate-600">Event:</dt>
						<dd class="italic text-slate-400">Not documented</dd>
					{:else}
						<dt class="text-slate-600">Event:</dt>
						<dd>
							<span class="font-mono text-xs text-slate-900">{endpoint.event_var.var_name}</span>{#if endpoint.event_var.var_values !== 'unknown'}{' '}<span class="text-slate-600">({formatEventValues(endpoint.event_var.var_values)})</span>{/if}
						</dd>
					{/if}

					{#if endpoint.event_var.var_meaning !== 'unknown'}
						<dt class="text-slate-600">Event meaning:</dt>
						<dd class="text-slate-700">{endpoint.event_var.var_meaning}</dd>
					{/if}
				</dl>

				{#if endpoint.notes?.length > 0}
					<div class="mt-3 border-t border-slate-100 pt-3">
						<p class="mb-1.5 flex items-center gap-1.5 text-xs text-slate-500">
							<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
							</svg>
							<span>Notes (AI generated)</span>
							<span class="text-slate-400">({endpoint.notes.length})</span>
						</p>
						<ul class="space-y-1.5 text-sm text-slate-600">
							{#each endpoint.notes as note, noteIndex (noteIndex)}
								<li class="flex gap-2 leading-relaxed">
									<span class="flex-shrink-0 text-slate-400">&#8226;</span>
									<span>{note}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</section>
{:else}
<section>
	<button
		onclick={onToggleOpen}
		aria-expanded={isOpen}
		aria-controls="endpoints-panel-content"
		class="mb-3 flex w-full items-center gap-2 cursor-pointer text-left text-slate-600 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
	>
		<svg class="h-4 w-4 text-slate-400 {isOpen ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
		</svg>
		<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Detected Survival Endpoints</h3>
	</button>
	{#if isOpen}
		<div id="endpoints-panel-content" class="relative">
			<div
				bind:this={endpointsScrollerEl}
				onscroll={updateEndpointsScrollAffordance}
				class="flex flex-col gap-2 md:flex-row md:flex-nowrap md:items-stretch md:overflow-x-auto md:overflow-y-visible md:overscroll-x-contain md:snap-x md:snap-mandatory md:pb-1 md:pr-4"
			>
				{#each endpoints as endpoint, epIndex (`${getEndpointKey(endpoint)}-${epIndex}`)}
					{@const endpointKey = getEndpointKey(endpoint)}
					{@const isSelectableEndpoint = Boolean(endpoint.abbrv) && isCompleteEndpoint(endpoint)}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div
						role={isSelectableEndpoint ? 'button' : undefined}
						tabindex={isSelectableEndpoint ? 0 : undefined}
						aria-pressed={isSelectableEndpoint ? selectedEndpointKey === endpointKey : undefined}
						class="flex w-full flex-col rounded-md md:w-[46%] md:flex-none md:self-stretch md:snap-start {selectedEndpointKey === endpointKey
							? 'border-2 border-neutral-800'
							: 'border'} {getEndpointCardBorderClass(
							endpoint,
						)} {isEndpointIncomplete(endpoint) ? 'bg-slate-50 opacity-75' : 'bg-white'} {isSelectableEndpoint
							? 'cursor-pointer transition-colors'
							: ''}"
						onclick={() => {
							if (!isSelectableEndpoint) return;
							if (onSelectEndpoint) onSelectEndpoint(endpointKey);
						}}
						onkeydown={(event) => {
							if (!isSelectableEndpoint) return;
							if (event.key !== 'Enter' && event.key !== ' ') return;
							event.preventDefault();
							if (onSelectEndpoint) onSelectEndpoint(endpointKey);
						}}
					>
						<div class="px-3 py-2">
							<div class="mb-1.5 flex items-center gap-2">
								{#if endpoint.abbrv}
									<span class="inline-flex items-center rounded bg-neutral-800 px-2 py-0.5 text-xs font-bold text-white"
										>{endpoint.abbrv}</span
									>
								{/if}
								<span class="text-sm font-medium text-slate-900">{getEndpointFullName(endpoint.abbrv)}</span>
								{#if isSelectableEndpoint}
									<button
										type="button"
										aria-pressed={selectedEndpointKey === endpointKey}
										onclick={(event) => {
											event.stopPropagation();
											if (onSelectEndpoint) onSelectEndpoint(endpointKey);
										}}
										class="ml-auto rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
									>
										{selectedEndpointKey === endpointKey ? 'Selected' : 'Select'}
									</button>
								{/if}
							</div>

							<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
								{#if endpoint.time_var.var_name === 'unknown'}
									<dt class="text-slate-600">Time:</dt>
									<dd class="italic text-slate-400">Not documented</dd>
								{:else}
									<dt class="text-slate-600">Time:</dt>
									<dd>
										<span class="font-mono text-xs text-slate-900">{endpoint.time_var.var_name}</span>{#if endpoint.time_var.var_unit !== 'unknown'}{' '}<span class="text-slate-600">({endpoint.time_var.var_unit})</span>{/if}
									</dd>
								{/if}

								{#if endpoint.event_var.var_name === 'unknown'}
									<dt class="text-slate-600">Event:</dt>
									<dd class="italic text-slate-400">Not documented</dd>
								{:else}
									<dt class="text-slate-600">Event:</dt>
									<dd class="inline-flex items-center gap-1.5">
										<span class="font-mono text-xs text-slate-900">{endpoint.event_var.var_name}</span>{#if endpoint.event_var.var_values !== 'unknown'}{' '}<span class="text-slate-600">({formatEventValues(endpoint.event_var.var_values)})</span>{/if}
										{#if endpoint.event_var.var_meaning !== 'unknown'}
											<button
												type="button"
												data-card-control="true"
												class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] font-semibold leading-none text-slate-600 transition-colors hover:border-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
												aria-label="Show meaning for event values"
												title={endpoint.event_var.var_meaning}
											>
												?
											</button>
										{/if}
									</dd>
								{/if}
							</dl>
						</div>

						{#if endpoint.notes?.length > 0}
							<div class="mt-auto border-t bg-white {selectedEndpointKey === endpointKey ? 'border-neutral-800' : 'border-slate-100'}">
								<button
									onclick={(event) => {
										event.stopPropagation();
										toggleNotes(epIndex);
									}}
									class="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
								>
									<span class="flex items-center gap-1.5 text-slate-600">
										<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
										</svg>
										<span>Notes (AI generated)</span>
										<span class="text-slate-400">({endpoint.notes.length})</span>
									</span>
									<svg
										class="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 {openNotes.has(epIndex) ? 'rotate-180' : ''}"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
									</svg>
								</button>
								{#if openNotes.has(epIndex)}
									<div class="relative">
										<div
											id="endpoint-notes-body-{datasetId}-{epIndex}"
											onscroll={(event) =>
												updateNotesScrollAffordanceForIndex(
													epIndex,
													event.currentTarget as HTMLDivElement,
												)}
											class="max-h-40 overflow-y-auto px-3 pb-3 pr-2 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgb(100_116_139)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/55 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500/70 [&::-webkit-scrollbar-track]:bg-transparent"
										>
											<ul class="space-y-2 text-sm text-slate-600">
												{#each endpoint.notes as note, noteIndex (noteIndex)}
													<li class="flex gap-2 leading-relaxed">
														<span class="flex-shrink-0 text-slate-400">&#8226;</span>
														<span>{note}</span>
													</li>
												{/each}
											</ul>
										</div>
										{#if notesCanScrollUp.has(epIndex)}
											<div class="pointer-events-none absolute left-0 right-0 top-0 h-4 bg-gradient-to-b from-white/50 to-transparent"></div>
										{/if}
										{#if notesCanScrollDown.has(epIndex)}
											<div class="pointer-events-none absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-white/60 to-transparent"></div>
											<div class="pointer-events-none absolute bottom-1 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100/95 text-slate-500 shadow-sm ring-1 ring-slate-200/70">
												<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 10l5 5 5-5"></path>
												</svg>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
			{#if isDesktop && canScrollEndpointsLeft}
				<div class="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-slate-100/55 to-transparent"></div>
			{/if}
			{#if isDesktop && canScrollEndpointsRight}
				<div class="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-slate-100/55 to-transparent"></div>
			{/if}
		</div>
	{/if}
</section>
{/if}
