<script lang="ts">
	import type { Dataset } from '../../types/dataset';
	import {
		ariaSort,
		getExperimentTypeAbbrev,
		getNcbiDataFormatted,
		getReproducibleFormatted,
		sortIndicator,
		type SortColumn,
		type SortDirection,
	} from '../../lib/dataset-utils';

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
	role="tabpanel"
	aria-labelledby={panelLabelledBy}
	tabindex={isDesktop ? undefined : 0}
	hidden={!isDesktop && mobileTab !== 'list'}
	class="overflow-auto bg-white"
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
			<thead class="sticky top-0 z-10 border-b-2 border-slate-200 bg-slate-50 shadow-sm">
				<tr>
					<th
						class="py-2 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						GSE ID
					</th>
					<th
						class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						Endpoints
					</th>
					<th
						aria-sort={ariaSort(sortColumn, sortDirection, 'experiment_type')}
						class="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						<button
							type="button"
							onclick={() => onSort('experiment_type')}
							class="flex w-full cursor-pointer select-none items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
						>
							<span>Exp Type</span>
							<span class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-blue-600"
								>{sortIndicator(sortColumn, sortDirection, 'experiment_type')}</span
							>
						</button>
					</th>
					<th
						aria-sort={ariaSort(sortColumn, sortDirection, 'reproducible')}
						class="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						<button
							type="button"
							onclick={() => onSort('reproducible')}
							class="flex w-full cursor-pointer select-none items-center justify-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
						>
							<span>Reproducible</span>
							<span class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-blue-600"
								>{sortIndicator(sortColumn, sortDirection, 'reproducible')}</span
							>
						</button>
					</th>
					<th
						aria-sort={ariaSort(sortColumn, sortDirection, 'ncbi_data')}
						class="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						<button
							type="button"
							onclick={() => onSort('ncbi_data')}
							class="flex w-full cursor-pointer select-none items-center justify-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
						>
							<span>NCBI Data</span>
							<span class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-blue-600"
								>{sortIndicator(sortColumn, sortDirection, 'ncbi_data')}</span
							>
						</button>
					</th>
					<th
						aria-sort={ariaSort(sortColumn, sortDirection, 'samples')}
						class="py-2 pl-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-700"
						style="white-space: nowrap;"
					>
						<button
							type="button"
							onclick={() => onSort('samples')}
							class="ml-auto flex cursor-pointer select-none items-center justify-end gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
						>
							<span>Samples</span>
							<span class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-blue-600"
								>{sortIndicator(sortColumn, sortDirection, 'samples')}</span
							>
						</button>
					</th>
				</tr>
			</thead>
			<tbody role="presentation">
				{#each sortedDatasets as dataset, index (dataset.data_id)}
					<tr
						id="row-{dataset.data_id}"
						aria-rowindex={index + 1}
						aria-selected={selectedId === dataset.data_id}
						data-dataset-id={dataset.data_id}
						onclick={() => onSelectDataset(dataset.data_id)}
						class="cursor-pointer border-b border-slate-100 border-l-4 transition-[background-color,border-color] duration-150
							{selectedId === dataset.data_id
							? 'border-l-blue-600 bg-blue-50'
							: 'border-l-transparent hover:bg-slate-100'}
							{selectedId !== dataset.data_id ? 'even:bg-gray-50/50' : ''}
							{focusedIndex === index && isTbodyFocused
							? 'ring-2 ring-inset ring-blue-500'
							: ''}"
					>
						<td class="py-2 pl-4 pr-3 text-sm font-medium text-slate-900" style="white-space: nowrap;"
							>{dataset.data_id}</td
						>
						<td class="px-3 py-2 text-sm" style="white-space: nowrap;">
							<div class="flex flex-nowrap gap-1">
								{#each dataset['survival-endpoints'].filter((endpoint) => endpoint.abbrv) as endpoint, endpointIndex (dataset.data_id + '-' + endpointIndex)}
									<span
										class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
										>{endpoint.abbrv}</span
									>
								{/each}
							</div>
						</td>
						<td class="px-2 py-2 text-sm text-slate-900" style="white-space: nowrap;"
							>{getExperimentTypeAbbrev(dataset['Experiment type'])}</td
						>
						<td class="px-2 py-2 text-center text-sm text-slate-900" style="white-space: nowrap;"
							>{getReproducibleFormatted(dataset.Reproducible)}</td
						>
						<td class="px-2 py-2 text-center text-sm text-slate-900" style="white-space: nowrap;"
							>{getNcbiDataFormatted(dataset['NCBI-generated data'])}</td
						>
						<td class="py-2 pl-2 pr-4 text-right font-mono text-sm tabular-nums text-slate-900" style="white-space: nowrap;"
							>{dataset.data_summary.samples.toLocaleString()}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
