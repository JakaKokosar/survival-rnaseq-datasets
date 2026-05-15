<script lang="ts">
	import type { Dataset, GeoSeriesSummary } from '../../types/dataset';
	import {
		ariaSort,
		getEndpointFullName,
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
		sampleOriginMap: Map<string, string[]>;
		onSort: (column: SortColumn) => void;
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
		sampleOriginMap,
		onSort,
		onSelectDataset,
		onListboxKeydown,
		onListboxFocus,
		onListboxBlur,
	}: Props = $props();

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

	function formatCompleteInfoPercent(endpoint: Dataset['survival-endpoints'][number], samples: number): string {
		const completeCount = endpoint.stats?.n_complete;
		if (
			typeof completeCount !== 'number' ||
			!Number.isFinite(completeCount) ||
			typeof samples !== 'number' ||
			!Number.isFinite(samples) ||
			samples <= 0
		) {
			return '—';
		}
		return formatPercent((completeCount / samples) * 100);
	}
</script>

<div
	bind:this={panelElement}
	id={panelId}
	data-tour="dataset-table"
	role="tabpanel"
	aria-labelledby={panelLabelledBy}
	tabindex={isDesktop ? undefined : 0}
	hidden={!isDesktop && mobileTab !== 'list'}
	class="min-w-0 overflow-auto bg-white"
>
	<div
		role="grid"
		tabindex={0}
		aria-label="Dataset table"
		aria-rowcount={sortedDatasets.length}
		aria-activedescendant={selectedId ? `row-${selectedId}` : undefined}
		onkeydown={onListboxKeydown}
		onfocus={onListboxFocus}
		onblur={onListboxBlur}
		class="focus-visible:outline-none"
	>
		<table class="w-full">
			<colgroup>
				<col style="width: 105px;" />
				<col />
				<col />
				<col style="width: 276px;" />
			</colgroup>
			<thead class="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 shadow-sm">
				<tr>
					<th
						aria-sort={ariaSort(sortColumn, sortDirection, 'samples')}
						class="py-3 pl-4 pr-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						<button
							type="button"
							onclick={() => onSort('samples')}
							class="ml-auto flex cursor-pointer select-none items-center justify-end gap-1 rounded px-1 py-0.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
						>
							<span># SAMPLES</span>
							<span class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-neutral-800"
								>{sortIndicator(sortColumn, sortDirection, 'samples')}</span
							>
						</button>
					</th>
					<th
						aria-sort={ariaSort(sortColumn, sortDirection, 'sampleOrigin')}
						class="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						<button
							type="button"
							onclick={() => onSort('sampleOrigin')}
							class="flex cursor-pointer select-none items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
						>
							<span>SAMPLE ORIGIN</span>
							<span class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-neutral-800"
								>{sortIndicator(sortColumn, sortDirection, 'sampleOrigin')}</span
							>
						</button>
					</th>
					<th
						aria-sort={ariaSort(sortColumn, sortDirection, 'cancer')}
						class="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
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
					<th
						class="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700"
						style="white-space: nowrap;"
					>
						<div class="grid min-w-[236px] grid-cols-[5.25rem_4.75rem_4.75rem] items-center gap-2">
							<span>Endpoint</span>
							<span class="text-right">Complete</span>
							<span class="text-right">Censored</span>
						</div>
					</th>
				</tr>
			</thead>
			<tbody role="presentation">
				{#each sortedDatasets as dataset, index (dataset.data_id)}
					{@const completeEndpoints = getCompleteKMPlotEndpoints(dataset)}
					{@const seriesSummary = summariesMap.get(dataset.data_id)}
					<tr
						id="row-{dataset.data_id}"
						aria-rowindex={index + 1}
						aria-selected={selectedId === dataset.data_id}
						data-dataset-id={dataset.data_id}
						onclick={() => onSelectDataset(dataset.data_id)}
						class="group cursor-pointer border-b border-slate-100 border-l-4 transition-[background-color,border-color] duration-150
							{selectedId === dataset.data_id
							? 'border-l-slate-400 bg-slate-100'
							: focusedIndex === index && isTbodyFocused
								? 'border-l-slate-300 bg-slate-50'
								: 'border-l-transparent hover:bg-slate-100'}
							{!(selectedId === dataset.data_id || (focusedIndex === index && isTbodyFocused))
								? 'even:bg-gray-50/50'
								: ''}
							{focusedIndex === index && isTbodyFocused
							? 'ring-2 ring-inset ring-slate-400'
							: ''}"
					>
						<td class="py-2 pl-4 pr-2 text-right font-mono text-sm tabular-nums text-slate-900" style="white-space: nowrap;"
							>{dataset.data_summary.samples.toLocaleString()}</td
						>
						<td class="py-2 px-3 text-sm text-slate-700" style="white-space: nowrap;">
							{#each sampleOriginMap.get(dataset.data_id) ?? [] as country, i (`${dataset.data_id}-${country}-${i}`)}
								{#if i > 0}<br />{/if}{country}
							{:else}
								—
							{/each}
						</td>
						<td class="py-2 px-3 text-sm" style="white-space: nowrap;">
							{#if seriesSummary}
								<div class="font-medium capitalize text-slate-900">{seriesSummary.cancer_group}</div>
								<div class="text-xs text-slate-400">{dataset.data_id}</div>
							{:else}
								<div class="font-medium text-slate-900">{dataset.data_id}</div>
							{/if}
						</td>
						<td class="px-3 py-2 text-sm text-slate-700" style="white-space: nowrap;">
							<div class="min-w-[236px]">
								{#if completeEndpoints.length === 0}
									<span
										class="inline-flex h-7 items-center rounded border border-dashed border-slate-300 bg-slate-50 px-2 text-xs font-medium text-slate-500"
										aria-label="No complete endpoints"
										title="No complete endpoints"
									>
										No complete endpoint metrics
									</span>
								{:else}
									{#each completeEndpoints as endpoint (getKMPlotEndpointKey(endpoint))}
										{@const fullEndpointLabel = getEndpointFullName(endpoint.abbrv)}
										{@const endpointLabel =
											fullEndpointLabel && fullEndpointLabel.trim().length > 0
												? fullEndpointLabel
												: endpoint.abbrv ?? 'Unknown endpoint'}
										<div
											class="grid min-h-7 grid-cols-[5.25rem_4.75rem_4.75rem] items-center gap-2 border-t border-slate-100 py-1 first:border-t-0 first:pt-0 last:pb-0"
										>
											<span
												class="inline-flex h-5 w-fit min-w-9 items-center justify-center rounded bg-slate-200 px-1.5 text-xs font-bold leading-5 text-slate-700 ring-1 ring-inset ring-slate-300"
												aria-label={endpointLabel}
												title={endpointLabel}
											>
												{endpoint.abbrv}
											</span>
											<span class="text-right font-mono text-sm tabular-nums text-slate-900">
												{formatCompleteInfoPercent(endpoint, dataset.data_summary.samples)}
											</span>
											<span class="text-right font-mono text-sm tabular-nums text-slate-900">
												{formatRatioPercent(endpoint.stats?.censored_ratio)}
											</span>
										</div>
									{/each}
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
