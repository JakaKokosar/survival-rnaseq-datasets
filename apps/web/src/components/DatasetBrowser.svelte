<script lang="ts">
	import { onMount } from 'svelte';
	import type { Dataset, GeoSeriesSummary } from '../types/dataset';
	import {
		clampSplitRatio,
		filterDatasets,
		readSplitRatio,
		readUrlParams,
		saveSplitRatio,
		SPLIT_RATIO_MAX,
		SPLIT_RATIO_MIN,
		type SortColumn,
		type SortDirection,
		sortDatasets,
		updateUrlParams,
	} from '../lib/dataset-utils';
	import {
		getCompleteKMPlotEndpoints,
		getDefaultEndpointKey,
		getKMPlotEndpointKey,
		isCompleteKMPlotEndpoint,
	} from '../lib/dataset-selection';
	import DatasetTable from './dataset-browser/DatasetTable.svelte';
	import DatasetDetailHeader from './dataset-browser/DatasetDetailHeader.svelte';
	import EndpointsPanel from './dataset-browser/EndpointsPanel.svelte';
	import KmPlotPanel from './dataset-browser/KmPlotPanel.svelte';
	import SampleDataPanel from './dataset-browser/SampleDataPanel.svelte';

	interface Props {
		datasets: Dataset[];
		summariesMap: Map<string, GeoSeriesSummary>;
		sampleOriginMap: Map<string, string[]>;
	}

	let { datasets, summariesMap, sampleOriginMap }: Props = $props();

	let selectedId: string | null = $state(null);
	let sortColumn: SortColumn | null = $state('samples');
	let sortDirection: SortDirection | null = $state('desc');
	let searchQuery = $state('');
	let focusedIndex = $state(-1);
	let isTbodyFocused = $state(false);

	let splitRatio = $state(45);
	let maxTableSplitRatio = $state(SPLIT_RATIO_MAX);
	let hasUserResized = $state(false);
	let isDragging = $state(false);

	let mobileTab: 'list' | 'details' = $state('list');
	let isDesktop = $state(true);

	let detailSection: 'km' | 'sample-data' | 'endpoints' = $state('km');
	const DEFAULT_DATASET_ID = 'GSE224564';

	function buildDataFileDownloadUrl(filename: string): string {
		const encodedFilename = encodeURIComponent(filename);
		return `/downloads/${encodedFilename}`;
	}

	let mainEl = $state<HTMLElement>();
	let listTabEl = $state<HTMLButtonElement>();
	let detailsTabEl = $state<HTMLButtonElement>();
	let kmSectionTabEl = $state<HTMLButtonElement>();
	let sampleDataSectionTabEl = $state<HTMLButtonElement>();
	let endpointsSectionTabEl = $state<HTMLButtonElement>();
	let listPanelEl = $state<HTMLDivElement | null>(null);
	let detailsPanelEl = $state<HTMLDivElement | null>(null);
	const mobileListTabId = 'dataset-browser-tab-list';
	const mobileDetailsTabId = 'dataset-browser-tab-details';
	const listPanelId = 'dataset-browser-panel-list';
	const detailsPanelId = 'dataset-browser-panel-details';
	const kmSectionTabId = 'detail-section-tab-km';
	const sampleDataSectionTabId = 'detail-section-tab-sample-data';
	const endpointsSectionTabId = 'detail-section-tab-endpoints';
	const kmSectionPanelId = 'detail-section-panel-km';
	const sampleDataSectionPanelId = 'detail-section-panel-sample-data';
	const endpointsSectionPanelId = 'detail-section-panel-endpoints';

	let filteredDatasets = $derived(filterDatasets(datasets, searchQuery, summariesMap));
	let sortedDatasets = $derived(
		sortDatasets(filteredDatasets, sortColumn, sortDirection, summariesMap),
	);
	let selectedDataset = $derived(
		selectedId ? datasets.find((dataset) => dataset.data_id === selectedId) ?? null : null,
	);

	onMount(() => {
		const savedRatio = readSplitRatio();
		if (savedRatio !== null) {
			splitRatio = savedRatio;
			hasUserResized = true;
		}
		isDesktop = window.innerWidth >= 1024;

		const urlParams = readUrlParams();
		searchQuery = urlParams.query;
		if (urlParams.sort) {
			sortColumn = urlParams.sort;
			sortDirection = urlParams.direction;
		}
		if (urlParams.selected) {
			const dataset = datasets.find((item) => item.data_id === urlParams.selected);
			if (dataset) {
				selectedId = urlParams.selected;
				const idx = sortedDatasets.findIndex((item) => item.data_id === urlParams.selected);
				if (idx !== -1) focusedIndex = idx;
			}
		} else {
			const defaultDataset = searchQuery
				? sortedDatasets[0]
				: datasets.find((item) => item.data_id === DEFAULT_DATASET_ID) ?? datasets[0];
			if (defaultDataset) {
				selectedId = defaultDataset.data_id;
				const idx = sortedDatasets.findIndex((item) => item.data_id === defaultDataset.data_id);
				if (idx !== -1) focusedIndex = idx;
				updateUrlParams(selectedId, sortColumn, sortDirection, searchQuery);
			}
		}

		scheduleSplitBoundsSync();
	});

	function selectDataset(id: string): void {
		selectedId = id;
		const idx = sortedDatasets.findIndex((dataset) => dataset.data_id === id);
		if (idx !== -1) focusedIndex = idx;
		if (window.innerWidth < 1024) mobileTab = 'details';
		updateUrlParams(selectedId, sortColumn, sortDirection, searchQuery);
	}

	function setSearchQuery(query: string): void {
		searchQuery = query;
		focusedIndex = selectedId
			? sortedDatasets.findIndex((dataset) => dataset.data_id === selectedId)
			: -1;
		updateUrlParams(selectedId, sortColumn, sortDirection, searchQuery);
	}

	function navigateRow(delta: number): void {
		if (sortedDatasets.length === 0) return;
		const idx = Math.max(0, Math.min(sortedDatasets.length - 1, focusedIndex + delta));
		focusedIndex = idx;
		selectedId = sortedDatasets[idx].data_id;
		updateUrlParams(selectedId, sortColumn, sortDirection, searchQuery);
		requestAnimationFrame(() => {
			document.getElementById('row-' + sortedDatasets[idx].data_id)?.scrollIntoView({
				block: 'nearest',
				behavior: 'smooth',
			});
		});
	}

	function navigateToEdge(position: 'first' | 'last'): void {
		if (sortedDatasets.length === 0) return;
		const idx = position === 'first' ? 0 : sortedDatasets.length - 1;
		focusedIndex = idx;
		selectedId = sortedDatasets[idx].data_id;
		updateUrlParams(selectedId, sortColumn, sortDirection, searchQuery);
		requestAnimationFrame(() => {
			document.getElementById('row-' + sortedDatasets[idx].data_id)?.scrollIntoView({
				block: 'nearest',
				behavior: 'smooth',
			});
		});
	}

	function clearSelection(): void {
		selectedId = null;
		focusedIndex = -1;
		updateUrlParams(selectedId, sortColumn, sortDirection, searchQuery);
	}

	function sortBy(column: SortColumn): void {
		if (sortColumn === column) {
			if (sortDirection === 'asc') {
				sortDirection = 'desc';
			} else {
				sortDirection = null;
				sortColumn = null;
			}
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
		if (selectedId) {
			requestAnimationFrame(() => {
				const idx = sortedDatasets.findIndex((dataset) => dataset.data_id === selectedId);
				if (idx !== -1) focusedIndex = idx;
			});
		}
		updateUrlParams(selectedId, sortColumn, sortDirection, searchQuery);
	}

	function getTableNaturalWidth(): number | null {
		const tableEl = listPanelEl?.querySelector('table');
		if (tableEl instanceof HTMLTableElement) return tableEl.offsetWidth;
		return null;
	}

	function getListScrollbarWidth(): number {
		if (!listPanelEl) return 0;
		const scrollEl = listPanelEl.querySelector<HTMLElement>('[data-table-scroll]') ?? listPanelEl;
		return Math.max(0, scrollEl.offsetWidth - scrollEl.clientWidth);
	}

	function getTableMaxSplitRatio(): number {
		if (!mainEl) return SPLIT_RATIO_MAX;
		const mainWidth = mainEl.getBoundingClientRect().width;
		const tableWidth = getTableNaturalWidth();
		if (!tableWidth || mainWidth <= 0) return SPLIT_RATIO_MAX;
		const requiredWidth = tableWidth + getListScrollbarWidth();
		return Math.min(SPLIT_RATIO_MAX, (requiredWidth / mainWidth) * 100);
	}

	function clampTableSplitRatio(ratio: number): number {
		const maxRatio = getTableMaxSplitRatio();
		return Math.min(clampSplitRatio(ratio), maxRatio);
	}

	function syncSplitBounds(): void {
		maxTableSplitRatio = getTableMaxSplitRatio();
		splitRatio = hasUserResized ? clampTableSplitRatio(splitRatio) : maxTableSplitRatio;
	}

	function scheduleSplitBoundsSync(): void {
		requestAnimationFrame(() => {
			syncSplitBounds();
			requestAnimationFrame(syncSplitBounds);
		});
	}

	function initializeSplitFromRenderedWidth(): void {
		if (!mainEl || !listPanelEl) return;
		const mainWidth = mainEl.getBoundingClientRect().width;
		if (mainWidth <= 0) return;
		splitRatio = clampTableSplitRatio((listPanelEl.offsetWidth / mainWidth) * 100);
		hasUserResized = true;
	}

	function startDrag(): void {
		if (!hasUserResized) initializeSplitFromRenderedWidth();
		isDragging = true;
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		window.addEventListener('mousemove', handleDrag);
		window.addEventListener('mouseup', stopDrag);
	}

	function handleDrag(event: MouseEvent): void {
		if (!isDragging || !mainEl) return;
		const rect = mainEl.getBoundingClientRect();
		splitRatio = clampTableSplitRatio(((event.clientX - rect.left) / rect.width) * 100);
	}

	function stopDrag(): void {
		if (!isDragging) return;
		isDragging = false;
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
		window.removeEventListener('mousemove', handleDrag);
		window.removeEventListener('mouseup', stopDrag);
		saveSplitRatio(splitRatio);
	}

	function adjustSplit(delta: number): void {
		if (!hasUserResized) initializeSplitFromRenderedWidth();
		splitRatio = clampTableSplitRatio(splitRatio + delta);
		saveSplitRatio(splitRatio);
	}

	function handleListboxKeydown(event: KeyboardEvent): void {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				navigateRow(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				navigateRow(-1);
				break;
			case 'Home':
				event.preventDefault();
				navigateToEdge('first');
				break;
			case 'End':
				event.preventDefault();
				navigateToEdge('last');
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (selectedId) mobileTab = 'details';
				break;
			case 'Escape':
				event.preventDefault();
				clearSelection();
				break;
		}
	}

	function handleListboxFocus(): void {
		isTbodyFocused = true;
		if (focusedIndex < 0) {
			if (selectedId) focusedIndex = sortedDatasets.findIndex((dataset) => dataset.data_id === selectedId);
			if (focusedIndex < 0) focusedIndex = 0;
		}
	}

	function handleMobileTabKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			mobileTab = 'list';
			requestAnimationFrame(() => listTabEl?.focus());
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			mobileTab = 'details';
			requestAnimationFrame(() => detailsTabEl?.focus());
		} else if (event.key === 'Home') {
			event.preventDefault();
			mobileTab = 'list';
			requestAnimationFrame(() => listTabEl?.focus());
		} else if (event.key === 'End') {
			event.preventDefault();
			mobileTab = 'details';
			requestAnimationFrame(() => detailsTabEl?.focus());
		}
	}

	function handleDetailSectionKeydown(event: KeyboardEvent): void {
		const sectionTabs = [
			{ key: 'km' as const, element: kmSectionTabEl },
			{ key: 'sample-data' as const, element: sampleDataSectionTabEl },
			{ key: 'endpoints' as const, element: endpointsSectionTabEl },
		];
		const currentIndex = Math.max(0, sectionTabs.findIndex((tab) => tab.key === detailSection));

		function selectSection(index: number): void {
			const tab = sectionTabs[index];
			detailSection = tab.key;
			requestAnimationFrame(() => tab.element?.focus());
		}

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			selectSection((currentIndex - 1 + sectionTabs.length) % sectionTabs.length);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			selectSection((currentIndex + 1) % sectionTabs.length);
		} else if (event.key === 'Home') {
			event.preventDefault();
			selectSection(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			selectSection(sectionTabs.length - 1);
		}
	}

	function handleWindowResize(): void {
		isDesktop = window.innerWidth >= 1024;
		scheduleSplitBoundsSync();
	}

	$effect(() => {
		if (isDesktop) return;
		const activePanel = mobileTab === 'list' ? listPanelEl : detailsPanelEl;
		if (!activePanel) return;
		requestAnimationFrame(() => activePanel.focus());
	});

</script>

<svelte:window onresize={handleWindowResize} />

<div class="flex h-full flex-col">
	<div role="tablist" aria-label="View mode" class="flex border-b border-slate-200 bg-white lg:hidden">
		<button
			bind:this={listTabEl}
			id={mobileListTabId}
			data-tour="list-tab"
			role="tab"
			aria-selected={mobileTab === 'list'}
			aria-controls={listPanelId}
			aria-label="List View"
			aria-posinset={1}
			aria-setsize={2}
			tabindex={mobileTab === 'list' ? 0 : -1}
			onclick={() => (mobileTab = 'list')}
			onkeydown={handleMobileTabKeydown}
			class="flex-1 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 {mobileTab ===
			'list'
				? 'border-blue-600 text-blue-600'
				: 'border-transparent text-slate-600 hover:text-slate-900'}"
		>
			List
		</button>
		<button
			bind:this={detailsTabEl}
			id={mobileDetailsTabId}
			data-tour="details-tab"
			role="tab"
			aria-selected={mobileTab === 'details'}
			aria-controls={detailsPanelId}
			aria-label="Details View"
			aria-posinset={2}
			aria-setsize={2}
			tabindex={mobileTab === 'details' ? 0 : -1}
			onclick={() => (mobileTab = 'details')}
			onkeydown={handleMobileTabKeydown}
			class="flex-1 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 {mobileTab ===
			'details'
				? 'border-blue-600 text-blue-600'
				: 'border-transparent text-slate-600 hover:text-slate-900'}"
		>
			Details
		</button>
	</div>

	<main
		id="main-content"
		bind:this={mainEl}
		class="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[var(--split-left)_6px_1fr] focus:outline-none"
		style="--split-left: {hasUserResized ? `${splitRatio}%` : 'max-content'}"
	>
		<DatasetTable
			bind:panelElement={listPanelEl}
			panelId={listPanelId}
			panelLabelledBy={mobileListTabId}
			{sortedDatasets}
			{selectedId}
			{focusedIndex}
			{isTbodyFocused}
			{sortColumn}
			{sortDirection}
			{mobileTab}
			{isDesktop}
			{summariesMap}
			query={searchQuery}
			totalDatasetCount={datasets.length}
			onSort={sortBy}
			onQueryChange={setSearchQuery}
			onSelectDataset={selectDataset}
			onListboxKeydown={handleListboxKeydown}
			onListboxFocus={handleListboxFocus}
			onListboxBlur={() => (isTbodyFocused = false)}
		/>

		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			role="separator"
			aria-orientation="vertical"
			aria-valuenow={Math.round(splitRatio)}
			aria-valuemin={SPLIT_RATIO_MIN}
			aria-valuemax={Math.round(maxTableSplitRatio)}
			aria-label="Resize panels, use left and right arrow keys"
			tabindex={0}
			onmousedown={(event) => {
				event.preventDefault();
				startDrag();
			}}
			onkeydown={(event) => {
				if (event.key === 'ArrowLeft') {
					event.preventDefault();
					adjustSplit(-5);
				} else if (event.key === 'ArrowRight') {
					event.preventDefault();
					adjustSplit(5);
				}
			}}
			class="group hidden cursor-col-resize items-center justify-center bg-slate-200 transition-colors duration-150 hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 lg:flex {isDragging
				? 'bg-blue-500'
				: ''}"
		>
			<div class="h-8 w-1 rounded-full bg-slate-400 transition-colors group-hover:bg-white {isDragging ? 'bg-white' : ''}"></div>
		</div>

		<div
			bind:this={detailsPanelEl}
			id={detailsPanelId}
			data-tour="dataset-details"
			role="tabpanel"
			aria-labelledby={mobileDetailsTabId}
			tabindex={isDesktop ? undefined : 0}
			hidden={!isDesktop && mobileTab !== 'details'}
			class="dataset-details-panel overflow-y-auto bg-slate-50 {detailSection === 'km' ? 'dataset-details-panel-km' : ''}"
		>
			{#if selectedDataset}
				<div class="dataset-detail-shell p-6">
					<div class="dataset-detail-stack flex flex-col gap-6 {detailSection === 'km' ? 'dataset-detail-stack-km' : ''}">
						<DatasetDetailHeader
							dataset={selectedDataset}
							{buildDataFileDownloadUrl}
							{summariesMap}
							{sampleOriginMap}
							query={searchQuery}
						/>

						<div
							role="tablist"
							aria-label="Dataset analysis"
							class="dataset-analysis-tabs flex overflow-x-auto border-b border-slate-200"
						>
							<button
								bind:this={kmSectionTabEl}
								id={kmSectionTabId}
								data-tour="km-tab"
								type="button"
								role="tab"
								aria-selected={detailSection === 'km'}
								aria-controls={kmSectionPanelId}
								tabindex={detailSection === 'km' ? 0 : -1}
								onclick={() => (detailSection = 'km')}
								onkeydown={handleDetailSectionKeydown}
								class="dataset-analysis-tab shrink-0 border-b-2 px-4 py-3 text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 {detailSection === 'km'
									? 'border-slate-600 text-slate-700'
									: 'border-transparent text-slate-400 hover:text-slate-600'}"
							>
								Kaplan-Meier Plot
							</button>
							<button
								bind:this={sampleDataSectionTabEl}
								id={sampleDataSectionTabId}
								data-tour="sample-data-tab"
								type="button"
								role="tab"
								aria-selected={detailSection === 'sample-data'}
								aria-controls={sampleDataSectionPanelId}
								tabindex={detailSection === 'sample-data' ? 0 : -1}
								onclick={() => (detailSection = 'sample-data')}
								onkeydown={handleDetailSectionKeydown}
								class="dataset-analysis-tab shrink-0 border-b-2 px-4 py-3 text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 {detailSection === 'sample-data'
									? 'border-slate-600 text-slate-700'
									: 'border-transparent text-slate-400 hover:text-slate-600'}"
							>
								Sample Data Viewer
							</button>
							<button
								bind:this={endpointsSectionTabEl}
								id={endpointsSectionTabId}
								data-tour="endpoints-tab"
								type="button"
								role="tab"
								aria-selected={detailSection === 'endpoints'}
								aria-controls={endpointsSectionPanelId}
								tabindex={detailSection === 'endpoints' ? 0 : -1}
								onclick={() => (detailSection = 'endpoints')}
								onkeydown={handleDetailSectionKeydown}
								class="dataset-analysis-tab shrink-0 border-b-2 px-4 py-3 text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 {detailSection === 'endpoints'
									? 'border-slate-600 text-slate-700'
									: 'border-transparent text-slate-400 hover:text-slate-600'}"
							>
								Survival Endpoints
							</button>
						</div>

						{#if detailSection === 'km'}
							<div class="dataset-section-panel" id={kmSectionPanelId} role="tabpanel" aria-labelledby={kmSectionTabId}>
								<KmPlotPanel
									isOpen={true}
									showHeader={false}
									datasetId={selectedDataset?.data_id ?? null}
									endpoints={getCompleteKMPlotEndpoints(selectedDataset)}
								/>
							</div>
						{:else if detailSection === 'sample-data'}
							<div id={sampleDataSectionPanelId} role="tabpanel" aria-labelledby={sampleDataSectionTabId}>
								<SampleDataPanel dataset={selectedDataset} />
							</div>
						{:else}
							<div id={endpointsSectionPanelId} role="tabpanel" aria-labelledby={endpointsSectionTabId}>
								<EndpointsPanel
									datasetId={selectedDataset.data_id}
									endpoints={selectedDataset['survival-endpoints']}
									expanded={true}
									getEndpointKey={getKMPlotEndpointKey}
									isCompleteEndpoint={isCompleteKMPlotEndpoint}
								/>
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<div class="p-6">
					<div class="mt-24 flex flex-col items-center justify-center text-center text-slate-400">
						<svg aria-hidden="true" class="mb-4 h-16 w-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							></path>
						</svg>
						<p class="text-lg font-medium text-slate-500">Select a dataset to view details</p>
						<p class="mt-1 text-sm text-slate-400">Click on any row in the table or use arrow keys</p>
					</div>
				</div>
			{/if}
		</div>
	</main>
</div>

<style>
	@media (min-width: 1024px) and (max-height: 1050px) {
		.dataset-details-panel-km {
			overflow-y: hidden;
		}

		.dataset-detail-shell {
			height: 100%;
			min-height: 0;
			padding: 1rem;
		}

		.dataset-detail-stack-km {
			display: grid;
			height: 100%;
			min-height: 0;
			grid-template-rows: auto auto minmax(0, 1fr);
			gap: 1rem;
		}

		.dataset-analysis-tabs,
		.dataset-section-panel {
			min-height: 0;
		}

		.dataset-section-panel {
			height: 100%;
			overflow: hidden;
		}

		.dataset-analysis-tab {
			padding-block: 0.625rem;
		}
	}
</style>
