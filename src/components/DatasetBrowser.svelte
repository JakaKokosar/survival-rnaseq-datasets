<script lang="ts">
	import { onMount } from 'svelte';
	import type { Dataset } from '../types/dataset';
	import {
		getExperimentTypeAbbrev,
		getNcbiDataFormatted,
		getReproducibleFormatted,
		getEndpointFullName,
		formatEventValues,
		getEndpointCardBorderClass,
		isEndpointIncomplete,
		sortIndicator,
		ariaSort,
		sortDatasets,
		readUrlParams,
		updateUrlParams,
		readSplitRatio,
		saveSplitRatio,
		clampSplitRatio,
	} from '../lib/dataset-utils';
	import {
		createWidgetTarget,
		fetchEmbedSession,
		resolveMasterToFork,
		patchWidgetSettings,
		patchWorkflowSettings,
		type WorkflowStep,
		type WidgetTarget,
	} from '../lib/widget-api';

	// ── Props ────────────────────────────────────────────────────────────
	interface Props {
		datasets: Dataset[];
	}

	let { datasets }: Props = $props();

	// ── State ────────────────────────────────────────────────────────────
	let selectedId: string | null = $state(null);
	let sortColumn: string | null = $state('samples');
	let sortDirection: 'asc' | 'desc' | null = $state('desc');
	let focusedIndex = $state(-1);
	let isTbodyFocused = $state(false);

	let splitRatio = $state(45);
	let isDragging = $state(false);

	let mobileTab: 'list' | 'details' = $state('list');
	let isDesktop = $state(true);

	let openNotes = $state(new Set<number>());
	let isEndpointsOpen = $state(true);
	let isKmPlotOpen = $state(true);
	let isSampleDataViewerOpen = $state(true);
	let datasetIframeEl = $state<HTMLIFrameElement | undefined>(undefined);
	let kmIframeEl = $state<HTMLIFrameElement | undefined>(undefined);
	let selectedKMPlotEndpointKey: string | null = $state(null);
	let selectedCandidateGene: string | null = $state(null);
	let canScrollCandidateGenesUp = $state(false);
	let canScrollCandidateGenesDown = $state(false);
	let canScrollEndpointsLeft = $state(false);
	let canScrollEndpointsRight = $state(false);
	let notesCanScrollUp = $state(new Set<number>());
	let notesCanScrollDown = $state(new Set<number>());

	const WIDGET_CONFIG = {
		masterWs: 'test',
		masterDatasetWidget: 'c98a3522-27f0-4b19-a8e9-0041c1f88a65',
		masterKmWidget: '52cfecf4-c671-4692-9ef1-12b62ea7d297',
		masterDataTableWidget: '372d2689-e2a9-4752-8809-93303c4b466b',
	} as const;
	let sessionId = $state<string | null>(null);
	const widgetFrontendOrigin =
		import.meta.env.PUBLIC_WIDGET_FRONTEND_ORIGIN ?? 'http://localhost:3000';
	const widgetBackendOrigin =
		import.meta.env.PUBLIC_WIDGET_BACKEND_ORIGIN ?? 'http://localhost:4000';
	const hasWidgetIframes = true;

	const hiddenDatasetWidgetIframeSrc = $derived(
		sessionId
			? `${widgetFrontendOrigin}/embed/${WIDGET_CONFIG.masterWs}/${WIDGET_CONFIG.masterDatasetWidget}/${sessionId}?hidden=footer,,enter-data-set-url...,file,header,url`
			: '',
	);
	const kmWidgetIframeSrc = $derived(
		sessionId
			? `${widgetFrontendOrigin}/embed/${WIDGET_CONFIG.masterWs}/${WIDGET_CONFIG.masterKmWidget}/${sessionId}?hidden=survival-variables,sidebar,header,footer`
			: '',
	);
	const dataTableWidgetIframeSrc = $derived(
		sessionId
			? `${widgetFrontendOrigin}/embed/${WIDGET_CONFIG.masterWs}/${WIDGET_CONFIG.masterDataTableWidget}/${sessionId}?hidden=footer`
			: '',
	);

	const datasetWidgetTarget: WidgetTarget = createWidgetTarget();
	const kmWidgetTarget: WidgetTarget = createWidgetTarget();
	let pendingWorkflowPatchDatasetId: string | null = null;
	let pendingWorkflowPatchKey: string | null = null;
	let lastPatchedWorkflowPatchKey: string | null = null;
	let isWorkflowPatchInFlight = false;
	let pendingGroupVariablePatch: string | null = null;
	let lastPatchedGroupVariable: string | null = null;
	let isGroupVariablePatchInFlight = false;

	// ── Refs (plain variables, not $state) ───────────────────────────────
	let mainEl: HTMLElement;
	let listTabEl: HTMLButtonElement;
	let detailsTabEl: HTMLButtonElement;
	let endpointsScrollerEl: HTMLDivElement;
	let candidateGenesListEl: HTMLUListElement;

	// ── Derived ──────────────────────────────────────────────────────────
	let sortedDatasets = $derived.by(() => sortDatasets(datasets, sortColumn, sortDirection));

	let selectedDataset = $derived(
		selectedId ? datasets.find((d) => d.data_id === selectedId) ?? null : null,
	);

	function isUnknownFieldValue(value: string | null | undefined): boolean {
		if (!value) return true;
		const normalized = value.trim().toLowerCase();
		return normalized === '' || normalized === 'unknown';
	}

	function isCompleteKMPlotEndpoint(endpoint: Dataset['survival-endpoints'][number]): boolean {
		return (
			!isUnknownFieldValue(endpoint.time_var.var_name) &&
			!isUnknownFieldValue(endpoint.event_var.var_name)
		);
	}

	function getKMPlotEndpointKey(endpoint: Dataset['survival-endpoints'][number]): string {
		return `${endpoint.abbrv ?? ''}::${endpoint.time_var.var_name}::${endpoint.event_var.var_name}`;
	}

	function getKMPlotEndpointButtonLabel(
		endpoint: Dataset['survival-endpoints'][number],
		endpoints: Dataset['survival-endpoints'],
	): string {
		const abbr = endpoint.abbrv ?? '';
		if (!abbr) return '';
		const duplicateCount = endpoints.filter((candidate) => candidate.abbrv === abbr).length;
		if (duplicateCount <= 1) return abbr;

		return `${abbr} (${endpoint.time_var.var_name})`;
	}

	function getCompleteKMPlotEndpoints(dataset: Dataset | null): Dataset['survival-endpoints'] {
		if (!dataset) return [];
		return dataset['survival-endpoints'].filter(
			(endpoint) => Boolean(endpoint.abbrv) && isCompleteKMPlotEndpoint(endpoint),
		);
	}

	let kmPlotEndpointsForSelectedDataset = $derived.by(() => getCompleteKMPlotEndpoints(selectedDataset));
	let candidateGenesForSelectedDataset = $derived.by(() => selectedDataset?.candidate_genes ?? []);

	$effect(() => {
		selectedId;
		if (endpointsScrollerEl) {
			endpointsScrollerEl.scrollLeft = 0;
			requestAnimationFrame(() => updateEndpointsScrollAffordance());
		}
	});

	$effect(() => {
		isEndpointsOpen;
		isDesktop;
		const endpointCount = selectedDataset?.['survival-endpoints'].length ?? 0;
		endpointCount;
		requestAnimationFrame(() => updateEndpointsScrollAffordance());
	});

	$effect(() => {
		openNotes;
		requestAnimationFrame(() => {
			openNotes.forEach((idx) => {
				const notesEl = document.getElementById(`endpoint-notes-body-${idx}`) as HTMLDivElement | null;
				updateNotesScrollAffordanceForIndex(idx, notesEl);
			});
		});
	});

	// ── Lifecycle ────────────────────────────────────────────────────────
	onMount(() => {
		splitRatio = readSplitRatio();
		isDesktop = window.innerWidth >= 1024;

		const urlParams = readUrlParams();
		if (urlParams.sort) {
			sortColumn = urlParams.sort;
			sortDirection = urlParams.direction;
		}
		if (urlParams.selected) {
			const ds = datasets.find((d) => d.data_id === urlParams.selected);
			if (ds) {
				selectedId = urlParams.selected;
				const idx = sortedDatasets.findIndex((d) => d.data_id === urlParams.selected);
				if (idx !== -1) focusedIndex = idx;
			}
		}

		async function initWidgetApi() {
			try {
				const sessData = await fetchEmbedSession(widgetBackendOrigin);
				sessionId = sessData.session_id;

				const [dsData, kmData] = await Promise.all([
					resolveMasterToFork(
						widgetBackendOrigin,
						WIDGET_CONFIG.masterWs,
						WIDGET_CONFIG.masterDatasetWidget,
						sessData.session_id,
					),
					resolveMasterToFork(
						widgetBackendOrigin,
						WIDGET_CONFIG.masterWs,
						WIDGET_CONFIG.masterKmWidget,
						sessData.session_id,
					),
				]);

				datasetWidgetTarget.wsId = dsData.workSessionId;
				datasetWidgetTarget.widgetId = dsData.widgetId;
				kmWidgetTarget.wsId = kmData.workSessionId;
				kmWidgetTarget.widgetId = kmData.widgetId;

				void triggerWorkflowPatchIfReady();
			} catch (e) {
				console.warn('[Widget] Init error:', e);
			}
		}

		void initWidgetApi();
	});

	// ── Selection & Navigation ───────────────────────────────────────────
	function getDefaultEndpointKey(dataset: Dataset | null): string | null {
		const completeEndpoints = getCompleteKMPlotEndpoints(dataset);
		const osEndpoint = completeEndpoints.find((endpoint) => endpoint.abbrv === 'OS');
		if (osEndpoint) return getKMPlotEndpointKey(osEndpoint);
		const firstEndpoint = completeEndpoints[0];
		return firstEndpoint ? getKMPlotEndpointKey(firstEndpoint) : null;
	}

	function syncKMPlotEndpointSelectionForDataset(datasetId: string): void {
		const dataset = datasets.find((d) => d.data_id === datasetId) ?? null;
		const completeEndpoints = getCompleteKMPlotEndpoints(dataset);
		const hasSelectedEndpoint =
			selectedKMPlotEndpointKey &&
			completeEndpoints.some((endpoint) => getKMPlotEndpointKey(endpoint) === selectedKMPlotEndpointKey);

		if (!hasSelectedEndpoint) {
			selectedKMPlotEndpointKey = getDefaultEndpointKey(dataset);
		}
	}

	function queueWorkflowPatch(datasetId: string): void {
		pendingWorkflowPatchDatasetId = datasetId;
		pendingWorkflowPatchKey = `${datasetId}::${selectedKMPlotEndpointKey ?? ''}`;
		void triggerWorkflowPatchIfReady();
	}

	function queueGroupVariablePatch(gene: string | null): void {
		pendingGroupVariablePatch = gene && gene.trim() ? gene : null;
		void triggerGroupVariablePatchIfReady();
	}

	function selectDataset(id: string) {
		selectedId = id;
		const idx = sortedDatasets.findIndex((d) => d.data_id === id);
		if (idx !== -1) focusedIndex = idx;
		if (window.innerWidth < 1024) mobileTab = 'details';
		openNotes = new Set();
		notesCanScrollUp = new Set();
		notesCanScrollDown = new Set();
		syncKMPlotEndpointSelectionForDataset(id);
		updateUrlParams(selectedId, sortColumn, sortDirection);
		queueWorkflowPatch(id);
	}

	function navigateRow(delta: number) {
		if (sortedDatasets.length === 0) return;
		const idx = Math.max(0, Math.min(sortedDatasets.length - 1, focusedIndex + delta));
		focusedIndex = idx;
		selectedId = sortedDatasets[idx].data_id;
		syncKMPlotEndpointSelectionForDataset(selectedId);
		updateUrlParams(selectedId, sortColumn, sortDirection);
		queueWorkflowPatch(selectedId);
		requestAnimationFrame(() => {
			document
				.getElementById('row-' + sortedDatasets[idx].data_id)
				?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		});
	}

	function navigateToEdge(position: 'first' | 'last') {
		if (sortedDatasets.length === 0) return;
		const idx = position === 'first' ? 0 : sortedDatasets.length - 1;
		focusedIndex = idx;
		selectedId = sortedDatasets[idx].data_id;
		syncKMPlotEndpointSelectionForDataset(selectedId);
		updateUrlParams(selectedId, sortColumn, sortDirection);
		queueWorkflowPatch(selectedId);
		requestAnimationFrame(() => {
			document
				.getElementById('row-' + sortedDatasets[idx].data_id)
				?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		});
	}

	function clearSelection() {
		selectedId = null;
		focusedIndex = -1;
		updateUrlParams(selectedId, sortColumn, sortDirection);
		pendingWorkflowPatchDatasetId = null;
		pendingWorkflowPatchKey = null;
	}

	// ── Sorting ──────────────────────────────────────────────────────────
	function sortBy(column: string) {
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
				const idx = sortedDatasets.findIndex((d) => d.data_id === selectedId);
				if (idx !== -1) focusedIndex = idx;
			});
		}
		updateUrlParams(selectedId, sortColumn, sortDirection);
	}

	// ── Drag Handlers ────────────────────────────────────────────────────
	function startDrag() {
		isDragging = true;
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		window.addEventListener('mousemove', handleDrag);
		window.addEventListener('mouseup', stopDrag);
	}

	function handleDrag(e: MouseEvent) {
		if (!isDragging || !mainEl) return;
		const rect = mainEl.getBoundingClientRect();
		splitRatio = clampSplitRatio(((e.clientX - rect.left) / rect.width) * 100);
	}

	function stopDrag() {
		if (!isDragging) return;
		isDragging = false;
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
		window.removeEventListener('mousemove', handleDrag);
		window.removeEventListener('mouseup', stopDrag);
		saveSplitRatio(splitRatio);
	}

	function adjustSplit(delta: number) {
		splitRatio = clampSplitRatio(splitRatio + delta);
		saveSplitRatio(splitRatio);
	}

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

	// ── Keyboard Handlers ────────────────────────────────────────────────
	function handleListboxKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				navigateRow(1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				navigateRow(-1);
				break;
			case 'Home':
				e.preventDefault();
				navigateToEdge('first');
				break;
			case 'End':
				e.preventDefault();
				navigateToEdge('last');
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				if (selectedId) mobileTab = 'details';
				break;
			case 'Escape':
				e.preventDefault();
				clearSelection();
				break;
		}
	}

	function handleListboxFocus() {
		isTbodyFocused = true;
		if (focusedIndex < 0) {
			if (selectedId) {
				focusedIndex = sortedDatasets.findIndex((d) => d.data_id === selectedId);
			}
			if (focusedIndex < 0) focusedIndex = 0;
		}
	}

	function handleMobileTabKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			mobileTab = 'list';
			requestAnimationFrame(() => listTabEl?.focus());
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			mobileTab = 'details';
			requestAnimationFrame(() => detailsTabEl?.focus());
		}
	}

	function handleSortKeydown(e: KeyboardEvent, column: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			sortBy(column);
		}
	}

	// ── Notes Toggle ─────────────────────────────────────────────────────
	function toggleNotes(idx: number) {
		const next = new Set(openNotes);
		if (next.has(idx)) next.delete(idx);
		else next.add(idx);
		openNotes = next;
		requestAnimationFrame(() => {
			const notesEl = document.getElementById(`endpoint-notes-body-${idx}`) as HTMLDivElement | null;
			updateNotesScrollAffordanceForIndex(idx, notesEl);
		});
	}

	function handleKMPlotEndpointSelect(endpointKey: string): void {
		const hasEndpoint = kmPlotEndpointsForSelectedDataset.some(
			(endpoint) => getKMPlotEndpointKey(endpoint) === endpointKey,
		);
		if (!hasEndpoint) return;

		const nextEndpoint = kmPlotEndpointsForSelectedDataset.find(
			(endpoint) => getKMPlotEndpointKey(endpoint) === endpointKey,
		);
		if (nextEndpoint) {
			console.log('[KMPlot] select endpoint', {
				datasetId: selectedDataset?.data_id ?? null,
				endpointKey,
				label: getKMPlotEndpointButtonLabel(nextEndpoint, kmPlotEndpointsForSelectedDataset),
				abbrv: nextEndpoint.abbrv ?? null,
				timeVar: nextEndpoint.time_var,
				eventVar: nextEndpoint.event_var,
			});
		} else {
			console.log('[KMPlot] select endpoint (not found after hasEndpoint)', {
				datasetId: selectedDataset?.data_id ?? null,
				endpointKey,
			});
		}

		selectedKMPlotEndpointKey = endpointKey;
		if (selectedDataset?.data_id) {
			queueWorkflowPatch(selectedDataset.data_id);
		}
	}

	function handleCandidateGeneSelect(gene: string): void {
		selectedCandidateGene = gene;
		queueGroupVariablePatch(gene);
	}

	function buildWorkflowSteps(datasetId: string | null): WorkflowStep[] {
		if (!datasetWidgetTarget.widgetId) return [];
		if (!datasetId) return [];

		const dataset = datasets.find((d) => d.data_id === datasetId);
		if (!dataset) return [];

		const datasetUrl = `${widgetBackendOrigin}/files/sample-data/${dataset.data_id}_preprocessed_sample.tab`;
		const dataSetSettings: Record<string, unknown> = {
			selectedInput: 'url',
			url: datasetUrl,
		};

		const steps: WorkflowStep[] = [{ widgetId: datasetWidgetTarget.widgetId, settings: dataSetSettings }];

		const completeEndpoints = getCompleteKMPlotEndpoints(dataset);
		const selectedEndpoint =
			(selectedKMPlotEndpointKey
				? completeEndpoints.find((endpoint) => getKMPlotEndpointKey(endpoint) === selectedKMPlotEndpointKey)
				: null) ??
			completeEndpoints.find((endpoint) => endpoint.abbrv === 'OS') ??
			completeEndpoints[0] ??
			null;
		if (kmWidgetTarget.widgetId && selectedEndpoint) {
			const kmSettings: Record<string, unknown> = {};
			if (selectedEndpoint.time_var.var_name && selectedEndpoint.time_var.var_name !== 'unknown') {
				kmSettings.timeVariable = selectedEndpoint.time_var.var_name;
			}
			if (selectedEndpoint.event_var.var_name && selectedEndpoint.event_var.var_name !== 'unknown') {
				kmSettings.eventVariable = selectedEndpoint.event_var.var_name;
			}
			if (Object.keys(kmSettings).length > 0) {
				steps.unshift({ widgetId: kmWidgetTarget.widgetId, settings: kmSettings });
			}
		}

		console.log('[KMPlot] buildWorkflowSteps', {
			datasetId,
			selectedKMPlotEndpointKey,
			selectedEndpoint: selectedEndpoint
				? {
						key: getKMPlotEndpointKey(selectedEndpoint),
						abbrv: selectedEndpoint.abbrv ?? null,
						timeVar: selectedEndpoint.time_var,
						eventVar: selectedEndpoint.event_var,
				  }
				: null,
			steps,
		});

		// TODO: Append additional widget steps here when we enable multi-widget updates.
		return steps;
	}

	async function triggerWorkflowPatchIfReady(): Promise<void> {
		if (!pendingWorkflowPatchDatasetId) return;
		if (!pendingWorkflowPatchKey) return;
		if (pendingWorkflowPatchKey === lastPatchedWorkflowPatchKey) return;
		if (isWorkflowPatchInFlight) return;

		if (!datasetWidgetTarget.wsId || !datasetWidgetTarget.widgetId) {
			return;
		}

		const steps = buildWorkflowSteps(pendingWorkflowPatchDatasetId);
		if (steps.length === 0) return;

		try {
			isWorkflowPatchInFlight = true;
			console.log('[KMPlot] PATCH workflow-settings', {
				wsId: datasetWidgetTarget.wsId,
				pendingWorkflowPatchDatasetId,
				pendingWorkflowPatchKey,
				steps,
			});
			const response = await patchWorkflowSettings({
				backendOrigin: widgetBackendOrigin,
				wsId: datasetWidgetTarget.wsId,
				steps,
			});
			if (!response.ok) {
				console.warn(
					`Workflow PATCH failed (status ${response.status}) for ${pendingWorkflowPatchDatasetId}`,
				);
				return;
			}
			lastPatchedWorkflowPatchKey = pendingWorkflowPatchKey;
			pendingWorkflowPatchDatasetId = null;
			pendingWorkflowPatchKey = null;
		} catch (error) {
			console.warn('Workflow PATCH error', error);
		} finally {
			isWorkflowPatchInFlight = false;
			if (pendingWorkflowPatchKey && pendingWorkflowPatchKey !== lastPatchedWorkflowPatchKey) {
				void triggerWorkflowPatchIfReady();
			}
		}
	}

	async function triggerGroupVariablePatchIfReady(): Promise<void> {
		if (!pendingGroupVariablePatch) return;
		if (pendingGroupVariablePatch === lastPatchedGroupVariable) return;
		if (isGroupVariablePatchInFlight) return;
		if (!kmWidgetTarget.wsId || !kmWidgetTarget.widgetId) return;

		const groupVariable = pendingGroupVariablePatch;
		try {
			isGroupVariablePatchInFlight = true;
			console.log('[KMPlot] PATCH settings', {
				wsId: kmWidgetTarget.wsId,
				widgetId: kmWidgetTarget.widgetId,
				groupVariable,
			});
			const response = await patchWidgetSettings({
				backendOrigin: widgetBackendOrigin,
				wsId: kmWidgetTarget.wsId,
				widgetId: kmWidgetTarget.widgetId,
				settings: { groupVariable },
			});
			if (!response.ok) {
				console.warn(`KM settings PATCH failed (status ${response.status}) for groupVariable ${groupVariable}`);
				return;
			}
			lastPatchedGroupVariable = groupVariable;
			if (pendingGroupVariablePatch === groupVariable) {
				pendingGroupVariablePatch = null;
			}
		} catch (error) {
			console.warn('KM settings PATCH error', error);
		} finally {
			isGroupVariablePatchInFlight = false;
			if (pendingGroupVariablePatch && pendingGroupVariablePatch !== lastPatchedGroupVariable) {
				void triggerGroupVariablePatchIfReady();
			}
		}
	}

	$effect(() => {
		const dataset = selectedDataset;
		if (!dataset) {
			selectedKMPlotEndpointKey = null;
			return;
		}

		const hasSelectedEndpoint = kmPlotEndpointsForSelectedDataset.some(
			(endpoint) => getKMPlotEndpointKey(endpoint) === selectedKMPlotEndpointKey,
		);
		if (!hasSelectedEndpoint) {
			selectedKMPlotEndpointKey = getDefaultEndpointKey(dataset);
		}

		queueWorkflowPatch(dataset.data_id);
	});

	$effect(() => {
		const genes = candidateGenesForSelectedDataset;
		if (genes.length === 0) {
			selectedCandidateGene = null;
			pendingGroupVariablePatch = null;
			lastPatchedGroupVariable = null;
			return;
		}

		if (!selectedCandidateGene || !genes.includes(selectedCandidateGene)) {
			selectedCandidateGene = genes[0] ?? null;
		}

		queueGroupVariablePatch(selectedCandidateGene);

		requestAnimationFrame(() => updateCandidateGenesScrollAffordance());
	});
</script>

<svelte:window
	onresize={() => {
		isDesktop = window.innerWidth >= 1024;
		updateEndpointsScrollAffordance();
		openNotes.forEach((idx) => {
			const notesEl = document.getElementById(`endpoint-notes-body-${idx}`) as HTMLDivElement | null;
			updateNotesScrollAffordanceForIndex(idx, notesEl);
		});
		updateCandidateGenesScrollAffordance();
	}}
/>

<div class="flex h-full flex-col">
	<!-- Mobile Tab Bar -->
	<div
		role="tablist"
		aria-label="View mode"
		class="flex border-b border-slate-200 bg-white lg:hidden"
	>
		<button
			bind:this={listTabEl}
			role="tab"
			aria-selected={mobileTab === 'list'}
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
			role="tab"
			aria-selected={mobileTab === 'details'}
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
		style="--split-left: {splitRatio}%"
	>
		<!-- LEFT PANEL: Table -->
		<div
			role="tabpanel"
			aria-hidden={mobileTab !== 'list' && !isDesktop}
			class="overflow-auto bg-white {mobileTab !== 'list' ? 'hidden lg:block' : ''}"
		>
			<!-- Listbox wrapper: interactive role on a generic <div> is spec-compliant -->
			<div
				role="listbox"
				tabindex={0}
				aria-label="Dataset list"
				aria-activedescendant={selectedId ? `row-${selectedId}` : undefined}
				onkeydown={handleListboxKeydown}
				onfocus={handleListboxFocus}
				onblur={() => (isTbodyFocused = false)}
				class="focus-visible:outline-none"
			>
				<table class="w-full">
					<thead
						class="sticky top-0 z-10 border-b-2 border-slate-200 bg-slate-50 shadow-sm"
					>
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
								onclick={() => sortBy('experiment_type')}
								onkeydown={(e) => handleSortKeydown(e, 'experiment_type')}
								tabindex={0}
								role="columnheader"
								aria-sort={ariaSort(sortColumn, sortDirection, 'experiment_type')}
								class="cursor-pointer select-none px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
								style="white-space: nowrap;"
							>
								<div class="flex items-center gap-1.5">
									<span>Exp Type</span>
									<span
										class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-blue-600"
										>{sortIndicator(sortColumn, sortDirection, 'experiment_type')}</span
									>
								</div>
							</th>
							<th
								onclick={() => sortBy('reproducible')}
								onkeydown={(e) => handleSortKeydown(e, 'reproducible')}
								tabindex={0}
								role="columnheader"
								aria-sort={ariaSort(sortColumn, sortDirection, 'reproducible')}
								class="cursor-pointer select-none px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
								style="white-space: nowrap;"
							>
								<div class="flex items-center justify-center gap-1.5">
									<span>Reproducible</span>
									<span
										class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-blue-600"
										>{sortIndicator(sortColumn, sortDirection, 'reproducible')}</span
									>
								</div>
							</th>
							<th
								onclick={() => sortBy('ncbi_data')}
								onkeydown={(e) => handleSortKeydown(e, 'ncbi_data')}
								tabindex={0}
								role="columnheader"
								aria-sort={ariaSort(sortColumn, sortDirection, 'ncbi_data')}
								class="cursor-pointer select-none px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
								style="white-space: nowrap;"
							>
								<div class="flex items-center justify-center gap-1.5">
									<span>NCBI Data</span>
									<span
										class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-blue-600"
										>{sortIndicator(sortColumn, sortDirection, 'ncbi_data')}</span
									>
								</div>
							</th>
							<th
								onclick={() => sortBy('samples')}
								onkeydown={(e) => handleSortKeydown(e, 'samples')}
								tabindex={0}
								role="columnheader"
								aria-sort={ariaSort(sortColumn, sortDirection, 'samples')}
								class="cursor-pointer select-none py-2 pl-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
								style="white-space: nowrap;"
							>
								<div class="flex items-center justify-end gap-1.5">
									<span>Samples</span>
									<span
										class="inline-flex h-4 w-3 items-center justify-center text-sm font-bold text-blue-600"
										>{sortIndicator(sortColumn, sortDirection, 'samples')}</span
									>
								</div>
							</th>
						</tr>
					</thead>
					<tbody
						role="presentation"
						onclick={(e) => {
							const tr = (e.target as HTMLElement).closest('tr[data-dataset-id]');
							if (tr) selectDataset((tr as HTMLElement).dataset.datasetId ?? '');
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								const tr = (e.target as HTMLElement).closest('tr[data-dataset-id]');
								if (tr) {
									e.preventDefault();
									selectDataset((tr as HTMLElement).dataset.datasetId ?? '');
								}
							}
						}}
					>
						{#each sortedDatasets as dataset, index (dataset.data_id)}
							<tr
								id="row-{dataset.data_id}"
								data-dataset-id={dataset.data_id}
								role="option"
								aria-selected={selectedId === dataset.data_id}
								tabindex={selectedId === dataset.data_id ? 0 : -1}
								onclick={() => selectDataset(dataset.data_id)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										selectDataset(dataset.data_id);
									}
								}}
								class="cursor-pointer border-b border-slate-100 border-l-4 transition-[background-color,border-color] duration-150
									{selectedId === dataset.data_id
									? 'border-l-blue-600 bg-blue-50'
									: 'border-l-transparent hover:bg-slate-100'}
									{selectedId !== dataset.data_id ? 'even:bg-gray-50/50' : ''}
									{focusedIndex === index && isTbodyFocused
									? 'ring-2 ring-inset ring-blue-500'
									: ''}"
							>
								<td
									class="py-2 pl-4 pr-3 text-sm font-medium text-slate-900"
									style="white-space: nowrap;">{dataset.data_id}</td
								>
								<td class="px-3 py-2 text-sm" style="white-space: nowrap;">
									<div class="flex flex-nowrap gap-1">
										{#each dataset['survival-endpoints'].filter((e) => e.abbrv) as endpoint, epIndex (dataset.data_id + '-' + epIndex)}
											<span
												class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
												>{endpoint.abbrv}</span
											>
										{/each}
									</div>
								</td>
								<td
									class="px-2 py-2 text-sm text-slate-900"
									style="white-space: nowrap;"
									>{getExperimentTypeAbbrev(dataset['Experiment type'])}</td
								>
								<td
									class="px-2 py-2 text-center text-sm text-slate-900"
									style="white-space: nowrap;"
									>{getReproducibleFormatted(dataset.Reproducible)}</td
								>
								<td
									class="px-2 py-2 text-center text-sm text-slate-900"
									style="white-space: nowrap;"
									>{getNcbiDataFormatted(dataset['NCBI-generated data'])}</td
								>
								<td
									class="py-2 pl-2 pr-4 text-right font-mono text-sm tabular-nums text-slate-900"
									style="white-space: nowrap;"
									>{dataset.data_summary.samples.toLocaleString()}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- RESIZABLE DIVIDER: A separator with aria-valuenow is a focusable widget per WAI-ARIA spec
			 (https://www.w3.org/TR/wai-aria-1.2/#separator), but Svelte's linter doesn't distinguish
			 static from interactive separators. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			role="separator"
			aria-orientation="vertical"
			aria-valuenow={Math.round(splitRatio)}
			aria-valuemin={15}
			aria-valuemax={85}
			aria-label="Resize panels, use left and right arrow keys"
			tabindex={0}
			onmousedown={(e) => {
				e.preventDefault();
				startDrag();
			}}
			onkeydown={(e) => {
				if (e.key === 'ArrowLeft') {
					e.preventDefault();
					adjustSplit(-5);
				} else if (e.key === 'ArrowRight') {
					e.preventDefault();
					adjustSplit(5);
				}
			}}
			class="group hidden cursor-col-resize items-center justify-center bg-slate-200 transition-colors duration-150 hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 lg:flex {isDragging
				? 'bg-blue-500'
				: ''}"
		>
			<div
				class="h-8 w-1 rounded-full bg-slate-400 transition-colors group-hover:bg-white {isDragging
					? 'bg-white'
					: ''}"
			></div>
		</div>

		<!-- RIGHT PANEL: Detail View -->
		<div
			role="tabpanel"
			aria-hidden={mobileTab !== 'details' && !isDesktop}
			class="overflow-y-auto bg-slate-50 {mobileTab !== 'details' ? 'hidden lg:block' : ''}"
		>
			<div class="p-6">
				{#if selectedDataset}
					<div class="space-y-6">
						<!-- SECTION 1: Header & Status -->
						<header class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
							<h2 class="text-2xl font-bold text-slate-900">
								{selectedDataset.data_id}
							</h2>
							<a
								href={selectedDataset.data_url}
								target="_blank"
								rel="noopener noreferrer"
								class="mt-1 inline-flex items-center gap-1 rounded text-sm text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
							>
								<span>View on NCBI GEO</span>
								<svg
									aria-hidden="true"
									class="h-3.5 w-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
									></path>
								</svg>
							</a>
							<div class="mt-4">
								{#if selectedDataset.data_file_names && selectedDataset.data_file_names.length > 0}
									<div class="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1.75fr)_1px_minmax(0,1fr)] md:items-start md:gap-x-4 md:gap-y-0">
										<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-sm md:min-w-0">
											<dt class="font-medium text-slate-500">Experiment type:</dt>
											<dd class="text-slate-900">{selectedDataset['Experiment type']}</dd>
											<dt class="font-medium text-slate-500">NCBI data availability:</dt>
											<dd class="text-slate-900">
												{selectedDataset['NCBI-generated data'] === 'Available' ? 'Yes' : 'No'}
											</dd>
									<dt class="font-medium text-slate-500">Data reproducibility:</dt>
									<dd class="text-slate-900">
										{getReproducibleFormatted(selectedDataset.Reproducible)}
									</dd>
									<dt class="pt-0.5 font-medium text-slate-500">Related publications:</dt>
									<dd class="min-w-0 pt-0.5 text-slate-900">
										{#if selectedDataset.pmcids.length > 0}
											<span class="flex max-w-full flex-wrap items-center gap-x-6 gap-y-0.5">
												{#each selectedDataset.pmcids as pmcid (pmcid)}
													<a
														href="https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"
														target="_blank"
														rel="noopener noreferrer"
														class="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
													>
														<svg
															class="h-4 w-4 shrink-0 text-slate-500"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
															></path>
														</svg>
														<span>{pmcid}</span>
														<svg
															class="h-3 w-3 shrink-0 text-slate-400"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
															></path>
														</svg>
													</a>
												{/each}
											</span>
										{:else}
											<span class="italic text-slate-400">No publications linked</span>
										{/if}
									</dd>
								</dl>
										<div class="hidden w-px self-stretch bg-slate-200 md:block"></div>
										<div class="flex flex-col gap-2 md:min-w-0">
											{#each selectedDataset.data_file_names as filename (filename)}
												<a
													href="http://example.com/files/{filename}"
													download
													class="inline-flex items-start gap-1.5 rounded text-sm text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
												>
													<svg
														aria-hidden="true"
														class="h-4 w-4 flex-shrink-0"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
														></path>
													</svg>
													<span class="break-words whitespace-normal md:max-w-[360px] lg:max-w-[520px]">{filename}</span>
												</a>
											{/each}
										</div>
									</div>
								{:else}
									<!-- Without downloads: simple 2-column dl -->
									<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-sm">
										<dt class="font-medium text-slate-500">Experiment type:</dt>
										<dd class="text-slate-900">{selectedDataset['Experiment type']}</dd>
										<dt class="font-medium text-slate-500">NCBI data availability:</dt>
										<dd class="text-slate-900">
											{selectedDataset['NCBI-generated data'] === 'Available' ? 'Yes' : 'No'}
										</dd>
									<dt class="font-medium text-slate-500">Data reproducibility:</dt>
									<dd class="text-slate-900">
										{getReproducibleFormatted(selectedDataset.Reproducible)}
									</dd>
									<dt class="pt-0.5 font-medium text-slate-500">Related publications:</dt>
									<dd class="min-w-0 pt-0.5 text-slate-900">
										{#if selectedDataset.pmcids.length > 0}
											<span class="flex max-w-full flex-wrap items-center gap-x-6 gap-y-0.5">
												{#each selectedDataset.pmcids as pmcid (pmcid)}
													<a
														href="https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"
														target="_blank"
														rel="noopener noreferrer"
														class="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
													>
														<svg
															class="h-4 w-4 shrink-0 text-slate-500"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
															></path>
														</svg>
														<span>{pmcid}</span>
														<svg
															class="h-3 w-3 shrink-0 text-slate-400"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
															></path>
														</svg>
													</a>
												{/each}
											</span>
										{:else}
											<span class="italic text-slate-400">No publications linked</span>
										{/if}
									</dd>
								</dl>
							{/if}
						</div>
							{#if selectedDataset.Notes}
								<div
									class="mt-4 flex gap-3 rounded-r-lg border border-slate-200 border-l-4 border-l-slate-400 bg-slate-50 p-3"
								>
									<span class="flex-shrink-0 text-slate-500" aria-hidden="true">
										<svg
											class="h-5 w-5"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
											></path>
										</svg>
									</span>
									<p class="text-sm text-slate-700">{selectedDataset.Notes}</p>
								</div>
							{/if}
						</header>

					<!-- SECTION 2: Detected Survival Endpoints -->
					<section>
						<button
							onclick={() => (isEndpointsOpen = !isEndpointsOpen)}
							aria-expanded={isEndpointsOpen}
							class="mb-3 flex w-full items-center gap-2 cursor-pointer text-left text-slate-600 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
						>
							<svg
								class="h-4 w-4 text-slate-400 {isEndpointsOpen ? 'rotate-90' : ''}"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5l7 7-7 7"
								></path>
							</svg>
							<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
								Detected Survival Endpoints
							</h3>
						</button>
						{#if isEndpointsOpen}
							<div class="relative">
								<div
									bind:this={endpointsScrollerEl}
									onscroll={updateEndpointsScrollAffordance}
									class="flex flex-col gap-3 md:flex-row md:flex-nowrap md:items-stretch md:overflow-x-auto md:overscroll-x-contain md:snap-x md:snap-mandatory md:pb-1 md:pr-4"
								>
									{#each selectedDataset['survival-endpoints'] as endpoint, epIndex (epIndex)}
										{@const endpointKey = getKMPlotEndpointKey(endpoint)}
										{@const isSelectableEndpoint = Boolean(endpoint.abbrv) && isCompleteKMPlotEndpoint(endpoint)}
										<!-- Endpoint card: div with role="button" is focusable per ARIA; Svelte a11y linter does not recognize dynamic role. -->
										<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
										<div
											role={isSelectableEndpoint ? 'button' : undefined}
											tabindex={isSelectableEndpoint ? 0 : undefined}
											aria-pressed={isSelectableEndpoint
												? selectedKMPlotEndpointKey === endpointKey
												: undefined}
											onclick={(event) => {
												if (!isSelectableEndpoint) return;
												const target = event.target as HTMLElement;
												if (target.closest('[data-card-control="true"]')) return;
												handleKMPlotEndpointSelect(endpointKey);
											}}
											onkeydown={(event) => {
												if (!isSelectableEndpoint) return;
												if (event.key !== 'Enter' && event.key !== ' ') return;
												event.preventDefault();
												handleKMPlotEndpointSelect(endpointKey);
											}}
											class="flex w-full flex-col overflow-hidden rounded-lg border-2 shadow-sm md:w-[46%] md:flex-none md:self-stretch md:snap-start {getEndpointCardBorderClass(
												endpoint,
											)} {isEndpointIncomplete(endpoint) ? 'bg-slate-50 opacity-75' : 'bg-white'} {isSelectableEndpoint
												? 'cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
												: ''} {selectedKMPlotEndpointKey === endpointKey
												? 'border-slate-800'
												: ''}"
										>
												<!-- Card Content -->
												<div class="px-4 py-3">
												<!-- Badge + Full Name -->
												<div class="mb-3 flex items-center gap-2">
													{#if endpoint.abbrv}
														<span
															class="inline-flex items-center rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-white"
															>{endpoint.abbrv}</span
														>
													{/if}
													<span class="text-sm font-medium text-slate-900"
														>{getEndpointFullName(endpoint.abbrv)}</span
													>
												</div>

												<!-- Time Variable Section -->
												<div class="mb-3">
													<h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Time Variable</h4>
													{#if endpoint.time_var.var_name === 'unknown'}
														<p class="text-sm italic text-slate-400">Not documented</p>
													{:else}
														<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
															<dt class="font-medium text-slate-500">Variable:</dt>
															<dd><span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-900">{endpoint.time_var.var_name}</span></dd>
															<dt class="font-medium text-slate-500">Unit:</dt>
															<dd class={endpoint.time_var.var_unit === 'unknown' ? 'italic text-slate-400' : 'text-slate-900'}>{endpoint.time_var.var_unit === 'unknown' ? 'Not documented' : endpoint.time_var.var_unit}</dd>
														</dl>
													{/if}
												</div>

												<div class="my-3 h-px bg-slate-200/70"></div>

												<!-- Event Variable Section -->
												<div>
													<h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Event Variable</h4>
													{#if endpoint.event_var.var_name === 'unknown'}
														<p class="text-sm italic text-slate-400">Not documented</p>
													{:else}
														<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
															<dt class="font-medium text-slate-500">Variable:</dt>
															<dd><span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-900">{endpoint.event_var.var_name}</span></dd>
															{#if endpoint.event_var.var_values !== 'unknown'}
															<dt class="inline-flex items-center gap-1.5 font-medium text-slate-500">
																{#if endpoint.event_var.var_meaning !== 'unknown'}
																	<span class="group relative inline-flex">
																<button
																	type="button"
																	data-card-control="true"
																	class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold leading-none text-slate-500 transition-colors hover:border-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
																	aria-label="Show meaning for event values"
																	aria-describedby="event-meaning-{selectedDataset?.data_id ?? 'dataset'}-{epIndex}"
																		>
																			?
																		</button>
																		<span
																			id="event-meaning-{selectedDataset?.data_id ?? 'dataset'}-{epIndex}"
																			role="tooltip"
																			class="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-56 rounded-lg bg-slate-800 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-xl transition-opacity duration-150 sm:w-64 group-hover:opacity-100 group-focus-within:opacity-100"
																		>
																			{endpoint.event_var.var_meaning}
																		</span>
																	</span>
																{/if}
																<span>Values:</span>
															</dt>
															<dd class="text-slate-900">
																{formatEventValues(endpoint.event_var.var_values)}
															</dd>
															{/if}
														</dl>
													{/if}
												</div>
											</div>

											<!-- Collapsible Notes -->
											{#if endpoint.notes?.length > 0}
																<div
																	class="mt-auto border-t bg-white {selectedKMPlotEndpointKey === endpointKey
																		? 'border-slate-800'
																		: 'border-slate-100'}"
																>
																<button
																	onclick={(event) => {
																		event.stopPropagation();
																		toggleNotes(epIndex);
																	}}
																	data-card-control="true"
																	class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
																>
														<span
															class="flex items-center gap-2 text-slate-600"
														>
															<svg
																class="h-4 w-4"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	stroke-width="2"
																	d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
																></path>
															</svg>
															<span>AI Generated Notes</span>
															<span class="text-slate-400"
																>({endpoint.notes.length})</span
															>
														</span>
														<svg
															class="h-4 w-4 text-slate-400 transition-transform duration-200 {openNotes.has(
																epIndex,
															)
																? 'rotate-180'
																: ''}"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	stroke-width="2"
																	d="M19 9l-7 7-7-7"
																></path>
															</svg>
																	</button>
																{#if openNotes.has(epIndex)}
																	<div class="relative">
																		<div
																			id="endpoint-notes-body-{epIndex}"
																			onscroll={(event) =>
																				updateNotesScrollAffordanceForIndex(
																					epIndex,
																					event.currentTarget as HTMLDivElement,
																				)}
																			class="max-h-40 overflow-y-auto px-4 pb-4 pr-2 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgb(100_116_139)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/55 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500/70 [&::-webkit-scrollbar-track]:bg-transparent"
																		>
																			<ul
																				class="space-y-2 text-sm text-slate-600"
																			>
																	{#each endpoint.notes as note, noteIndex (noteIndex)}
																		<li
																			class="flex gap-2 leading-relaxed"
																		>
																		<span
																			class="flex-shrink-0 text-slate-400"
																			>&#8226;</span
																		>
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

					<!-- SECTION: Kaplan-Meier plot (collapsible) -->
					{#if hasWidgetIframes}
						<section>
							<button
								onclick={() => (isKmPlotOpen = !isKmPlotOpen)}
								aria-expanded={isKmPlotOpen}
								class="mb-3 flex w-full items-center gap-2 cursor-pointer text-left text-slate-600 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
							>
								<svg
									class="h-4 w-4 text-slate-400 {isKmPlotOpen ? 'rotate-90' : ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5l7 7-7 7"
									></path>
								</svg>
								<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
									Kaplan-Meier plot
								</h3>
							</button>
							<div
								class={isKmPlotOpen ? 'block' : 'hidden'}
								aria-hidden={!isKmPlotOpen}
							>
								<div class="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
									<!-- Data Set iframe kept in DOM but hidden for workflow PATCH handshake -->
									<div class="sr-only absolute -left-[9999px] h-px w-px overflow-hidden">
										<iframe
											bind:this={datasetIframeEl}
											src={hiddenDatasetWidgetIframeSrc}
											class="border-0"
											style="height: 1px; min-height: 1px;"
											title="Data Table (hidden)"
											loading="eager"
										></iframe>
									</div>
									<div class="grid bg-white md:h-[800px] md:grid-cols-[280px_minmax(0,1fr)]">
										<aside class="flex min-h-0 flex-col overflow-hidden border-b border-r border-slate-200 bg-slate-50 p-3 md:border-b-0">
											<div class="flex items-center gap-1.5">
												<p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
													Candidate genes
												</p>
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
											<div class="relative mt-2 min-h-0 flex-1 overflow-hidden bg-transparent">
												{#if candidateGenesForSelectedDataset.length > 0}
													<ul bind:this={candidateGenesListEl} onscroll={updateCandidateGenesScrollAffordance} role="listbox" aria-label="Candidate genes" class="h-full overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgb(148_163_184)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/60 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500/70 [&::-webkit-scrollbar-track]:bg-transparent">
														{#each candidateGenesForSelectedDataset as gene (gene)}
															<li class="border-b border-slate-100 last:border-b-0">
																<button
																	type="button"
																	role="option"
																	aria-selected={selectedCandidateGene === gene}
																	onclick={() => handleCandidateGeneSelect(gene)}
																	class="block w-full px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 {selectedCandidateGene === gene
																		? 'bg-slate-800 text-white'
																		: 'bg-transparent text-slate-700 hover:bg-slate-100/70'}"
																	title={gene}
																>
																	<span class="block break-all leading-5">{gene}</span>
																</button>
															</li>
														{/each}
													</ul>
													{#if canScrollCandidateGenesUp}
														<div class="pointer-events-none absolute left-0 right-0 top-0 h-6 bg-gradient-to-b from-slate-100/85 via-slate-50/45 to-transparent"></div>
													{/if}
													{#if canScrollCandidateGenesDown}
														<div class="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-100/85 via-slate-50/45 to-transparent"></div>
														<div class="pointer-events-none absolute bottom-1.5 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100/95 text-slate-500 shadow-sm ring-1 ring-slate-200/70">
															<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 10l5 5 5-5"></path>
															</svg>
														</div>
													{/if}
												{:else}
													<p class="px-1 py-3 text-sm italic text-slate-400">
														No candidate genes available for this dataset.
													</p>
												{/if}
											</div>
										</aside>
										<iframe
											bind:this={kmIframeEl}
											src={kmWidgetIframeSrc}
											class="w-full overflow-hidden border-0"
											style="height: 800px; min-height: 800px;"
											title="Kaplan Meier Plot"
											loading="lazy"
										></iframe>
									</div>
								</div>
							</div>
						</section>

						<!-- SECTION: Sample data viewer (collapsible) -->
						<section>
							<button
								onclick={() => (isSampleDataViewerOpen = !isSampleDataViewerOpen)}
								aria-expanded={isSampleDataViewerOpen}
								class="mb-3 flex w-full items-center gap-2 cursor-pointer text-left text-slate-600 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
							>
								<svg
									class="h-4 w-4 text-slate-400 {isSampleDataViewerOpen ? 'rotate-90' : ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5l7 7-7 7"
									></path>
								</svg>
								<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
									Sample data viewer
								</h3>
							</button>
							<div
								class={isSampleDataViewerOpen ? 'block' : 'hidden'}
								aria-hidden={!isSampleDataViewerOpen}
							>
								<div class="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
									<iframe
										src={dataTableWidgetIframeSrc}
										class="w-full overflow-hidden border-0"
										style="height: 560px; min-height: 560px;"
										title="Data Table Widget"
										loading="lazy"
									></iframe>
								</div>
							</div>
						</section>
					{/if}


					</div>
				{:else}
					<!-- Empty State -->
					<div
						class="mt-24 flex flex-col items-center justify-center text-center text-slate-400"
					>
						<svg
							aria-hidden="true"
							class="mb-4 h-16 w-16 text-slate-300"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							></path>
						</svg>
						<p class="text-lg font-medium text-slate-500">
							Select a dataset to view details
						</p>
						<p class="mt-1 text-sm text-slate-400">
							Click on any row in the table or use arrow keys
						</p>
					</div>
				{/if}
			</div>
		</div>
	</main>
</div>
