<script lang="ts">
	import type { Dataset, GeoSeriesSummary } from '../../types/dataset';
	import {
		ariaSort,
		getEndpointFullName,
		getSearchTextParts,
		sortIndicator,
		type SortColumn,
		type SortDirection,
	} from '../../lib/dataset-utils';
	import { getCompleteKMPlotEndpoints, getKMPlotEndpointKey } from '../../lib/dataset-selection';

	interface Props {
		panelElement?: HTMLDivElement | null;
		panelId: string;
		panelLabelledBy: string;
		sortedDatasets: Dataset[];
		selectedId: string | null;
		focusedIndex: number;
		isTbodyFocused: boolean;
		sortColumn: SortColumn | null;
		sortDirection: SortDirection | null;
		mobileTab: 'list' | 'details';
		isDesktop: boolean;
		summariesMap: Map<string, GeoSeriesSummary>;
		query: string;
		totalDatasetCount: number;
		onSort: (column: SortColumn) => void;
		onQueryChange: (query: string) => void;
		onSelectDataset: (id: string) => void;
		onListboxKeydown: (event: KeyboardEvent) => void;
		onListboxFocus: () => void;
		onListboxBlur: () => void;
	}

	let {
		panelElement = $bindable(),
		panelId,
		panelLabelledBy,
		sortedDatasets,
		selectedId,
		focusedIndex,
		isTbodyFocused,
		sortColumn,
		sortDirection,
		mobileTab,
		isDesktop,
		summariesMap,
		query,
		totalDatasetCount,
		onSort,
		onQueryChange,
		onSelectDataset,
		onListboxKeydown,
		onListboxFocus,
		onListboxBlur,
	}: Props = $props();

	let hoveredDatasetId = $state<string | null>(null);
	let activeDescendant = $derived(
		selectedId && sortedDatasets.some((dataset) => dataset.data_id === selectedId)
			? `row-${selectedId}`
			: undefined,
	);

	function formatPercentNumber(value: number): string {
		const rounded = Number(value.toFixed(1));
		return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
	}

	function formatPercent(value: number | undefined): string {
		if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
		return `${formatPercentNumber(value)}%`;
	}

	function formatRatioPercent(value: number | undefined): string {
		if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
		return formatPercentNumber(value * 100) + '%';
	}

	function formatMissingInfoPercent(endpoint: Dataset['survival-endpoints'][number], samples: number): string {
		const missingCount = endpoint.stats?.n_incomplete;
		if (
			typeof missingCount !== 'number' ||
			!Number.isFinite(missingCount) ||
			typeof samples !== 'number' ||
			!Number.isFinite(samples) ||
			samples <= 0
		) {
			return '—';
		}
		return formatPercent((missingCount / samples) * 100);
	}

	function getDatasetRowClasses(dataset: Dataset, index: number): string {
		const isSelected = selectedId === dataset.data_id;
		const isFocused = focusedIndex === index && isTbodyFocused;
		const isHovered = hoveredDatasetId === dataset.data_id;
		const base =
			'group cursor-pointer transition-[background-color,border-color] duration-150';

		if (isSelected) return `${base} bg-slate-100`;
		if (isFocused) return `${base} bg-slate-50 ring-2 ring-inset ring-slate-400`;
		if (isHovered) return `${base} bg-slate-100`;
		return `${base} ${index % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`;
	}

	function getDatasetStripeClasses(dataset: Dataset, index: number): string {
		if (selectedId === dataset.data_id) return 'border-l-slate-400';
		if (focusedIndex === index && isTbodyFocused) return 'border-l-slate-300';
		return 'border-l-transparent';
	}

	function handleSearchKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !query) return;
		event.preventDefault();
		onQueryChange('');
	}
</script>

{#snippet highlightedText(value: string)}
	{#each getSearchTextParts(value, query) as part (part)}
		{#if part.isMatch}
			<mark data-search-highlight class="rounded-sm bg-yellow-200 text-inherit">{part.text}</mark>
		{:else}
			{part.text}
		{/if}
	{/each}
{/snippet}

<div
	bind:this={panelElement}
	id={panelId}
	data-tour="dataset-table"
	role="tabpanel"
	aria-labelledby={panelLabelledBy}
	tabindex={isDesktop ? undefined : 0}
	hidden={!isDesktop && mobileTab !== 'list'}
	class="flex min-w-0 w-full flex-col overflow-hidden bg-white"
>
	<form role="search" class="flex-none border-b border-slate-200 bg-white p-2" onsubmit={(event) => event.preventDefault()}>
		<label for="dataset-search" class="sr-only">Search datasets</label>
		<div class="relative">
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
			>
				<circle cx="11" cy="11" r="7"></circle>
				<path d="m20 20-3.5-3.5"></path>
			</svg>
			<input
				id="dataset-search"
				type="search"
				value={query}
				oninput={(event) => onQueryChange(event.currentTarget.value)}
				onkeydown={handleSearchKeydown}
				placeholder="Search cancer, endpoint, title, summary, or GSE ID"
				autocomplete="off"
				class="w-full rounded-md border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
			/>
		</div>
		<p class="mt-1.5 text-xs text-slate-500" aria-live="polite">
			{#if query.trim()}
				{sortedDatasets.length} of {totalDatasetCount} datasets
			{:else}
				{totalDatasetCount} datasets
			{/if}
		</p>
	</form>

	<div data-table-scroll class="min-h-0 flex-1 overflow-auto">
		<div
			role="grid"
			tabindex={0}
			aria-label="Dataset table"
			aria-rowcount={sortedDatasets.length}
			aria-activedescendant={activeDescendant}
			onkeydown={onListboxKeydown}
			onfocus={onListboxFocus}
			onblur={onListboxBlur}
			class="min-w-0 w-full focus-visible:outline-none"
		>
			<table class="min-w-[31.5rem] w-max table-auto border-separate border-spacing-0">
			<colgroup>
				<col class="w-[4.25rem]" />
				<col class="w-[12.5rem]" />
				<col class="w-[5.25rem]" />
				<col class="w-[5rem]" />
				<col class="w-[5.5rem]" />
			</colgroup>
			<thead class="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 shadow-sm">
				<tr>
					<th
						aria-sort={ariaSort(sortColumn, sortDirection, 'samples')}
						class="py-2 pl-3 pr-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						<button
							type="button"
							title="Number of samples"
							onclick={() => onSort('samples')}
							class="ml-auto flex cursor-pointer select-none items-center justify-end gap-1 rounded px-1 py-0.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
						>
							<span>N</span>
							<span class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-neutral-800"
								>{sortIndicator(sortColumn, sortDirection, 'samples')}</span
							>
						</button>
					</th>
					<th
						aria-sort={ariaSort(sortColumn, sortDirection, 'cancer')}
						class="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						<button
							type="button"
							onclick={() => onSort('cancer')}
							class="flex cursor-pointer select-none items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
						>
							<span>CANCER</span>
							<span class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-neutral-800"
								>{sortIndicator(sortColumn, sortDirection, 'cancer')}</span
							>
						</button>
					</th>
					<th class="px-1.5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
						Endpoint
					</th>
					<th class="px-1.5 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-700">
						Missing
					</th>
					<th class="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-700">
						Censored
					</th>
				</tr>
			</thead>
			<tbody role="presentation">
				{#each sortedDatasets as dataset, index (dataset.data_id)}
					{@const completeEndpoints = getCompleteKMPlotEndpoints(dataset)}
					{@const seriesSummary = summariesMap.get(dataset.data_id)}
					{#if completeEndpoints.length === 0}
						<tr
							id="row-{dataset.data_id}"
							aria-rowindex={index + 1}
							aria-selected={selectedId === dataset.data_id}
							data-dataset-id={dataset.data_id}
							onclick={() => onSelectDataset(dataset.data_id)}
							onpointerenter={() => (hoveredDatasetId = dataset.data_id)}
							onpointerleave={() => (hoveredDatasetId = null)}
							class={getDatasetRowClasses(dataset, index)}
						>
							<td
								class="border-b border-l-4 border-slate-100 py-1.5 pl-3 pr-2 text-right align-middle font-mono text-sm tabular-nums text-slate-900 {getDatasetStripeClasses(dataset, index)}"
								style="white-space: nowrap;"
								title="{dataset.data_summary.samples.toLocaleString()} samples"
								>{dataset.data_summary.samples.toLocaleString()}</td
							>
							<td class="border-b border-slate-100 px-2 py-1.5 align-middle text-sm" style="white-space: nowrap;">
							{#if seriesSummary}
								<div class="font-medium capitalize leading-5 text-slate-900">
									{@render highlightedText(seriesSummary.cancer_group)}
								</div>
								<div class="text-xs leading-4 text-slate-400">{@render highlightedText(dataset.data_id)}</div>
							{:else}
								<div class="font-medium leading-5 text-slate-900">{@render highlightedText(dataset.data_id)}</div>
							{/if}
							</td>
							<td class="border-b border-slate-100 px-1.5 py-1.5 text-sm text-slate-700" style="white-space: nowrap;">
								<span
									class="inline-flex h-5 w-fit items-center rounded border border-dashed border-slate-300 bg-slate-50 px-1.5 text-xs font-medium text-slate-500"
									aria-label="No complete endpoints"
									title="No complete endpoints"
								>
									No complete metrics
								</span>
							</td>
							<td class="border-b border-slate-100 px-1.5 py-1.5 text-right font-mono text-sm tabular-nums text-slate-400">—</td>
							<td class="border-b border-slate-100 px-2 py-1.5 text-right font-mono text-sm tabular-nums text-slate-400">—</td>
						</tr>
					{:else}
						{#each completeEndpoints as endpoint, endpointIndex (getKMPlotEndpointKey(endpoint))}
							{@const fullEndpointLabel = getEndpointFullName(endpoint.abbrv)}
							{@const endpointLabel =
								fullEndpointLabel && fullEndpointLabel.trim().length > 0
									? fullEndpointLabel
									: endpoint.abbrv ?? 'Unknown endpoint'}
							<tr
								id={endpointIndex === 0 ? `row-${dataset.data_id}` : undefined}
								aria-rowindex={endpointIndex === 0 ? index + 1 : undefined}
								aria-selected={selectedId === dataset.data_id}
								data-dataset-id={dataset.data_id}
								onclick={() => onSelectDataset(dataset.data_id)}
								onpointerenter={() => (hoveredDatasetId = dataset.data_id)}
								onpointerleave={() => (hoveredDatasetId = null)}
								class={getDatasetRowClasses(dataset, index)}
							>
								{#if endpointIndex === 0}
									<td
										rowspan={completeEndpoints.length}
										class="border-b border-l-4 border-slate-100 py-1.5 pl-3 pr-2 text-right align-middle font-mono text-sm tabular-nums text-slate-900 {getDatasetStripeClasses(dataset, index)}"
										style="white-space: nowrap;"
										title="{dataset.data_summary.samples.toLocaleString()} samples"
										>{dataset.data_summary.samples.toLocaleString()}</td
									>
									<td
										rowspan={completeEndpoints.length}
										class="border-b border-slate-100 px-2 py-1.5 align-middle text-sm"
										style="white-space: nowrap;"
									>
									{#if seriesSummary}
										<div class="font-medium capitalize leading-5 text-slate-900">
											{@render highlightedText(seriesSummary.cancer_group)}
										</div>
										<div class="text-xs leading-4 text-slate-400">{@render highlightedText(dataset.data_id)}</div>
									{:else}
										<div class="font-medium leading-5 text-slate-900">{@render highlightedText(dataset.data_id)}</div>
										{/if}
									</td>
								{/if}
								<td
									class="border-b border-slate-100 px-1.5 py-1 text-sm text-slate-700 {endpointIndex > 0 ? 'border-t' : ''}"
									style="white-space: nowrap;"
								>
									<span
										class="inline-flex h-5 w-fit min-w-9 items-center justify-center rounded bg-slate-200 px-1.5 text-xs font-bold leading-5 text-slate-700 ring-1 ring-inset ring-slate-300"
										aria-label={endpointLabel}
										title={endpointLabel}
									>
										{@render highlightedText(endpoint.abbrv ?? '')}
									</span>
								</td>
								<td
									class="border-b border-slate-100 px-1.5 py-1 text-right font-mono text-sm tabular-nums text-slate-900 {endpointIndex > 0 ? 'border-t' : ''}"
								>
									{formatMissingInfoPercent(endpoint, dataset.data_summary.samples)}
								</td>
								<td
									class="border-b border-slate-100 px-2 py-1 text-right font-mono text-sm tabular-nums text-slate-900 {endpointIndex > 0 ? 'border-t' : ''}"
								>
									{formatRatioPercent(endpoint.stats?.censored_ratio)}
								</td>
							</tr>
						{/each}
					{/if}
				{/each}
			</tbody>
			</table>
			{#if sortedDatasets.length === 0}
				<div class="flex min-h-48 w-full flex-col items-center justify-center px-6 py-10 text-center">
					<p class="font-medium text-slate-700">No datasets match “{query.trim()}”</p>
					<p class="mt-1 text-sm text-slate-500">Try a cancer type, endpoint, title, summary term, or GSE ID.</p>
					<button
						type="button"
						onclick={() => onQueryChange('')}
						class="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
					>
						Clear search
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>
