<script lang="ts">
	import type { Dataset, GeoSeriesSummary } from '../../types/dataset';
	import {
		ariaSort,
		getEndpointFullName,
		sortIndicator,
		type SortColumn,
		type SortDirection,
	} from '../../lib/dataset-utils';
	import { getCompleteKMPlotEndpoints } from '../../lib/dataset-selection';

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
				<col />
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
						class="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						SAMPLE ORIGIN
					</th>
					<th
						class="py-3 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						Cancer
					</th>
					<th
						class="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						ENDPOINTS
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
							{#each sampleOriginMap.get(dataset.data_id) ?? [] as country, i}
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
					<td
						class="px-3 py-2 text-sm"
						style="white-space: nowrap;"
					>
							<div class="flex flex-nowrap gap-1">
								{#if completeEndpoints.length === 0}
									<span
										class="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
										aria-label="No complete endpoints"
										title="No complete endpoints"
									>
										—
									</span>
								{:else}
									{#each completeEndpoints as endpoint, endpointIndex (dataset.data_id + '-' + endpointIndex)}
										{@const fullEndpointLabel = getEndpointFullName(endpoint.abbrv)}
										{@const endpointLabel =
											fullEndpointLabel && fullEndpointLabel.trim().length > 0
												? fullEndpointLabel
												: endpoint.abbrv ?? 'Unknown endpoint'}
										<span
											class="inline-flex items-center rounded bg-neutral-800 px-2 py-0.5 text-xs font-bold text-white"
											aria-label={endpointLabel}
											title={endpointLabel}
										>
											{endpoint.abbrv}
										</span>
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
