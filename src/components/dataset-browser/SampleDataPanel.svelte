<script lang="ts">
	import { tick } from 'svelte';
	import { get } from 'svelte/store';
	import {
		createTable,
		getCoreRowModel,
		getSortedRowModel,
		type ColumnDef,
		type Row,
		type SortingState,
		type Updater,
	} from '@tanstack/table-core';
	import { createVirtualizer, type VirtualItem } from '@tanstack/svelte-virtual';
	import Papa from 'papaparse';
	import type { Dataset } from '../../types/dataset';

	type SampleRow = {
		id: string;
		values: string[];
	};

	type SampleTable = {
		filename: string;
		headers: string[];
		rows: SampleRow[];
		totalRows: number;
	};

	type CachedSampleData = {
		csv?: {
			filename: string;
			value: string;
		};
		table?: SampleTable;
	};

	interface Props {
		dataset: Dataset | null;
	}

	let { dataset }: Props = $props();

	const tableCache = new Map<string, CachedSampleData>();

	let table = $state.raw<SampleTable | null>(null);
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let activeAbort: AbortController | null = null;
	let runId = 0;
	let columnWidths = $state<number[]>([]);
	let tableEl = $state<HTMLTableElement | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);
	let resizing: { index: number; startX: number; startWidth: number } | null = null;
	let sorting = $state<SortingState>([]);

	const MIN_COLUMN_WIDTH = 56;
	const MAX_INITIAL_WIDTH = 180;
	const ESTIMATED_ROW_HEIGHT = 34;
	const VIRTUAL_OVERSCAN = 10;

	const coreRowModel = getCoreRowModel<SampleRow>();
	const sortedRowModel = getSortedRowModel<SampleRow>();
	const tanstackTableInstance = createTable<SampleRow>({
		state: {
			sorting: [],
		},
		onStateChange: () => {},
		onSortingChange: updateSorting,
		data: [],
		columns: [],
		getCoreRowModel: coreRowModel,
		getSortedRowModel: sortedRowModel,
		renderFallbackValue: null,
	});

	const rowVirtualizer = createVirtualizer<HTMLDivElement, HTMLTableRowElement>({
		count: 0,
		getScrollElement: () => scrollEl,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		overscan: VIRTUAL_OVERSCAN,
		initialRect: {
			width: 800,
			height: 560,
		},
	});

	let tableColumns = $derived(table ? createSampleColumns(table.headers) : []);
	let tableData = $derived(table?.rows ?? []);
	let tanstackTable = $derived.by(() => {
		tanstackTableInstance.setOptions((previous) => ({
			...previous,
			data: tableData,
			columns: tableColumns,
			state: {
				...tanstackTableInstance.initialState,
				sorting,
			},
			onStateChange: () => {},
			onSortingChange: updateSorting,
			getCoreRowModel: coreRowModel,
			getSortedRowModel: sortedRowModel,
			renderFallbackValue: null,
		}));
		return {
			headerGroups: tanstackTableInstance.getHeaderGroups(),
			rows: tanstackTableInstance.getRowModel().rows,
		};
	});
	let headerGroups = $derived(tanstackTable.headerGroups);
	let tableRows = $derived(tanstackTable.rows);
	let tableWidth = $derived(columnWidths.reduce((total, width) => total + width, 0));
	let virtualRows = $derived.by((): VirtualItem[] => {
		const rows = $rowVirtualizer.getVirtualItems();
		if (rows.length > 0 || !table) return rows;
		const fallbackCount = Math.min(
			tableRows.length,
			Math.ceil(560 / ESTIMATED_ROW_HEIGHT) + VIRTUAL_OVERSCAN,
		);
		return Array.from({ length: fallbackCount }, (_unused, index) => ({
			key: index,
			index,
			start: index * ESTIMATED_ROW_HEIGHT,
			end: (index + 1) * ESTIMATED_ROW_HEIGHT,
			size: ESTIMATED_ROW_HEIGHT,
			lane: 0,
		}));
	});
	let totalVirtualHeight = $derived($rowVirtualizer.getTotalSize());
	let topVirtualPadding = $derived(virtualRows[0]?.start ?? 0);
	let bottomVirtualPadding = $derived.by(() => {
		const lastVirtualRow = virtualRows.at(-1);
		if (!lastVirtualRow) return 0;
		return Math.max(0, totalVirtualHeight - lastVirtualRow.end);
	});

	function startResize(event: MouseEvent, index: number) {
		event.preventDefault();
		resizing = {
			index,
			startX: event.clientX,
			startWidth: columnWidths[index] ?? MIN_COLUMN_WIDTH,
		};
		document.body.style.userSelect = 'none';
		document.body.style.cursor = 'col-resize';
		window.addEventListener('mousemove', handleResizeMove);
		window.addEventListener('mouseup', stopResize);
	}

	function handleResizeMove(event: MouseEvent) {
		if (!resizing) return;
		const delta = event.clientX - resizing.startX;
		const next = columnWidths.slice();
		next[resizing.index] = Math.max(MIN_COLUMN_WIDTH, resizing.startWidth + delta);
		columnWidths = next;
	}

	function stopResize() {
		resizing = null;
		document.body.style.userSelect = '';
		document.body.style.cursor = '';
		window.removeEventListener('mousemove', handleResizeMove);
		window.removeEventListener('mouseup', stopResize);
	}

	function updateSorting(updater: Updater<SortingState>): void {
		sorting = typeof updater === 'function' ? updater(sorting) : updater;
	}

	function getSortDirection(columnId: string, currentSorting: SortingState): false | 'asc' | 'desc' {
		const sort = currentSorting.find((item) => item.id === columnId);
		if (!sort) return false;
		return sort.desc ? 'desc' : 'asc';
	}

	function getAriaSort(
		columnId: string,
		currentSorting: SortingState,
	): 'none' | 'ascending' | 'descending' {
		const direction = getSortDirection(columnId, currentSorting);
		if (direction === 'asc') return 'ascending';
		if (direction === 'desc') return 'descending';
		return 'none';
	}

	let statusText = $derived.by(() => {
		if (!dataset) return 'No dataset selected';
		if (loading) return 'Loading sample data';
		if (errorMessage) return 'Sample data unavailable';
		if (!table) return 'No sample data loaded';
		return `${table.totalRows.toLocaleString()} rows x ${table.headers.length.toLocaleString()} columns`;
	});

	function fallbackFilename(id: string): string {
		return `${id}_preprocessed_ssgsea.csv`;
	}

	function getCandidateFilenames(currentDataset: Dataset): string[] {
		const filenames = currentDataset.data_file_names ?? [];
		const fallback = fallbackFilename(currentDataset.data_id);
		return Array.from(new Set([filenames[0], fallback].filter((name): name is string => Boolean(name))));
	}

	function buildDownloadUrl(filename: string): string {
		return `/downloads/${encodeURIComponent(filename)}`;
	}

	function normalizeCell(value: unknown): string {
		if (value === null || value === undefined) return '';
		return String(value);
	}

	function getCachedSampleData(datasetId: string): CachedSampleData {
		const cached = tableCache.get(datasetId);
		if (cached) return cached;
		const next: CachedSampleData = {};
		tableCache.set(datasetId, next);
		return next;
	}

	function getColumnLabel(header: string, columnIndex: number): string {
		return header || `Column ${columnIndex + 1}`;
	}

	function getColumnIndex(columnId: string): number {
		const index = Number(columnId);
		return Number.isInteger(index) ? index : 0;
	}

	function createSampleColumns(headers: string[]): ColumnDef<SampleRow>[] {
		return headers.map((header, columnIndex) => ({
			id: String(columnIndex),
			header: getColumnLabel(header, columnIndex),
			accessorFn: (row) => row.values[columnIndex] ?? '',
			enableSorting: true,
			sortDescFirst: false,
			sortingFn: 'alphanumeric',
			sortUndefined: 'last',
		}));
	}

	function getHeaderLabel(header: { column: { id: string; columnDef: ColumnDef<SampleRow> } }): string {
		const columnHeader = header.column.columnDef.header;
		if (typeof columnHeader === 'string') return columnHeader;
		return getColumnLabel('', getColumnIndex(header.column.id));
	}

	function getCellValue(cell: ReturnType<Row<SampleRow>['getVisibleCells']>[number]): string {
		const value = cell.getValue();
		return value === null || value === undefined ? '' : String(value);
	}

	function parseSampleCsv(
		csv: string,
		filename: string,
	): SampleTable {
		if (csv.trim().length === 0) {
			return {
				filename,
				headers: [],
				rows: [],
				totalRows: 0,
			};
		}

		const parsed = Papa.parse<string[]>(csv, {
			skipEmptyLines: 'greedy',
		});

		if (parsed.errors.length > 0) {
			const firstError = parsed.errors[0];
			throw new Error(firstError.message || `Could not parse ${filename}`);
		}

		const rows = parsed.data.map((row) => row.map(normalizeCell));
		const headers = rows.shift() ?? [];
		const normalizedRows = rows.map((row, rowIndex) => ({
			id: String(rowIndex),
			values: Array.from({ length: headers.length }, (_unused, index) => normalizeCell(row[index])),
		}));

		return {
			filename,
			headers,
			rows: normalizedRows,
			totalRows: normalizedRows.length,
		};
	}

	function isNumericCell(value: string): boolean {
		if (!value.trim()) return false;
		return Number.isFinite(Number(value));
	}

	function getCellClasses(value: string): string {
		const base =
			'overflow-hidden text-ellipsis whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-sm text-slate-700';
		return isNumericCell(value) ? `${base} text-right font-mono tabular-nums` : base;
	}

	async function fetchSampleCsv(
		currentDataset: Dataset,
		signal: AbortSignal,
	): Promise<{ filename: string; csv: string }> {
		const filenames = getCandidateFilenames(currentDataset);
		let lastError: Error | null = null;

		for (const filename of filenames) {
			try {
				const response = await fetch(buildDownloadUrl(filename), { signal });
				if (!response.ok) {
					lastError = new Error(`HTTP ${response.status}`);
					continue;
				}
				return {
					filename,
					csv: await response.text(),
				};
			} catch (error) {
				if ((error as { name?: string })?.name === 'AbortError') throw error;
				lastError = error instanceof Error ? error : new Error(String(error));
			}
		}

		throw new Error(lastError?.message ?? 'No sample data file found');
	}

	async function getSampleCsv(
		currentDataset: Dataset,
		signal: AbortSignal,
	): Promise<{ filename: string; csv: string }> {
		const cached = getCachedSampleData(currentDataset.data_id);
		if (cached.csv) {
			return {
				filename: cached.csv.filename,
				csv: cached.csv.value,
			};
		}

		const sampleCsv = await fetchSampleCsv(currentDataset, signal);
		cached.csv = {
			filename: sampleCsv.filename,
			value: sampleCsv.csv,
		};
		return sampleCsv;
	}

	async function loadSampleTable(currentDataset: Dataset, signal: AbortSignal): Promise<SampleTable> {
		const cached = getCachedSampleData(currentDataset.data_id);
		if (cached.table) return cached.table;

		const { filename, csv } = await getSampleCsv(currentDataset, signal);
		const parsedTable = parseSampleCsv(csv, filename);
		cached.table = parsedTable;
		return parsedTable;
	}

	$effect(() => {
		const currentDataset = dataset;
		runId += 1;
		const myRun = runId;
		sorting = [];

		if (activeAbort) activeAbort.abort();

		if (!currentDataset) {
			loading = false;
			errorMessage = null;
			table = null;
			return;
		}

		const cached = tableCache.get(currentDataset.data_id);
		if (cached?.table) {
			table = cached.table;
			loading = false;
			errorMessage = null;
			return;
		}

		const abort = new AbortController();
		activeAbort = abort;
		loading = true;
		errorMessage = null;
		table = null;

		(async () => {
			try {
				const parsedTable = await loadSampleTable(currentDataset, abort.signal);
				if (myRun !== runId) return;
				table = parsedTable;
			} catch (error) {
				if (myRun !== runId || (error as { name?: string })?.name === 'AbortError') return;
				errorMessage = error instanceof Error ? error.message : String(error);
				table = null;
			} finally {
				if (myRun === runId) loading = false;
				if (activeAbort === abort) activeAbort = null;
			}
		})();

		return () => {
			abort.abort();
			if (activeAbort === abort) activeAbort = null;
		};
	});

	$effect(() => {
		get(rowVirtualizer).setOptions({
			count: tableRows.length,
			getScrollElement: () => scrollEl,
			estimateSize: () => ESTIMATED_ROW_HEIGHT,
			overscan: VIRTUAL_OVERSCAN,
		});
	});

	$effect(() => {
		const current = table;
		columnWidths = [];
		if (!current || current.headers.length === 0) return;

		let cancelled = false;
		tick().then(() => {
			if (cancelled || !tableEl) return;
			const headerCells = tableEl.querySelectorAll('thead th');
			columnWidths = Array.from(headerCells).map((cell) =>
				Math.min(
					Math.max((cell as HTMLElement).offsetWidth, MIN_COLUMN_WIDTH),
					MAX_INITIAL_WIDTH,
				),
			);
		});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => stopResize);
</script>

<div data-tour="sample-data-viewer" class="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		role="region"
		bind:this={scrollEl}
		class="sample-data-scroll h-[560px] min-h-[560px] w-full overflow-x-auto overflow-y-scroll bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
		tabindex="0"
		aria-label="Sample data table"
	>
		{#if loading}
			<div class="flex h-full items-center justify-center px-4 text-sm text-slate-500" data-testid="sample-data-loading">
				Loading sample data...
			</div>
		{:else if errorMessage}
			<div class="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500" role="status">
				<div>
					<p class="font-medium text-slate-700">{statusText}</p>
					<p class="mt-1">{errorMessage}</p>
				</div>
			</div>
		{:else if table && table.headers.length > 0}
			<table
				bind:this={tableEl}
				class="border-separate border-spacing-0 {columnWidths.length ? 'table-fixed' : 'w-max min-w-full table-auto'}"
				style={columnWidths.length ? `width: ${tableWidth}px;` : undefined}
			>
				{#if columnWidths.length}
					<colgroup>
						{#each columnWidths as width, columnIndex (columnIndex)}
							<col style="width: {width}px;" />
						{/each}
					</colgroup>
				{/if}
				<thead class="sticky top-0 z-10 bg-slate-50 shadow-sm">
					{#each headerGroups as headerGroup (headerGroup.id)}
						<tr>
							{#each headerGroup.headers as header (header.id)}
								{@const columnIndex = getColumnIndex(header.column.id)}
								{@const label = getHeaderLabel(header)}
								{@const sortDir = getSortDirection(header.column.id, sorting)}
								<th
									scope="col"
									colspan={header.colSpan}
									aria-sort={getAriaSort(header.column.id, sorting)}
									class="relative border-b border-slate-200 p-0 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
									title={label}
								>
									{#if !header.isPlaceholder}
										<button
											type="button"
											class="flex h-full w-full cursor-pointer select-none items-center gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
											onclick={() => header.column.toggleSorting()}
										>
											<span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
											{#if sortDir}
												<span
													aria-hidden="true"
													class="ml-auto shrink-0 text-sm font-bold leading-none text-slate-700"
												>
													{sortDir === 'asc' ? '↑' : '↓'}
												</span>
											{/if}
										</button>
									{/if}
									<button
										type="button"
										aria-label="Resize column"
										class="group/resize absolute top-0 right-0 z-20 flex h-full w-3 translate-x-1/2 cursor-col-resize appearance-none items-center justify-center border-0 bg-transparent p-0"
										onmousedown={(event) => startResize(event, columnIndex)}
									>
										<span
											class="h-full w-px bg-slate-200 transition-all duration-100 group-hover/resize:w-0.5 group-hover/resize:bg-blue-500"
										></span>
									</button>
								</th>
							{/each}
						</tr>
					{/each}
				</thead>
				<tbody>
					{#if topVirtualPadding > 0}
						<tr aria-hidden="true">
							<td colspan={table.headers.length} style={`height: ${topVirtualPadding}px; padding: 0; border: 0;`}></td>
						</tr>
					{/if}
					{#each virtualRows as virtualRow (virtualRow.key)}
						{@const rowIndex = virtualRow.index}
						{@const row = tableRows[rowIndex]}
						<tr class={rowIndex % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}>
							{#each row?.getVisibleCells() ?? [] as cell (cell.id)}
								{@const value = getCellValue(cell)}
								<td
									class={getCellClasses(value)}
									title={value || undefined}
								>
									{#if value}
										{value}
									{:else}
										<span class="text-slate-300">—</span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
					{#if bottomVirtualPadding > 0}
						<tr aria-hidden="true">
							<td colspan={table.headers.length} style={`height: ${bottomVirtualPadding}px; padding: 0; border: 0;`}></td>
						</tr>
					{/if}
				</tbody>
			</table>
		{:else}
			<div class="flex h-full items-center justify-center px-4 text-sm text-slate-500" role="status">
				No sample rows available.
			</div>
		{/if}
	</div>

	{#if table}
		<div class="border-t border-slate-200 bg-slate-50/80 px-3 py-2">
			<div class="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex min-w-0 items-center gap-2">
					<p class="shrink-0 text-sm font-medium text-slate-700">{statusText}</p>
					<p class="truncate text-xs text-slate-400" title={table.filename}>{table.filename}</p>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Always-visible, non-overlay scrollbars so the bar never floats over the
	   sticky header and the table width stays stable. */
	.sample-data-scroll {
		scrollbar-color: #cbd5e1 #f1f5f9;
	}

	.sample-data-scroll::-webkit-scrollbar {
		width: 14px;
		height: 14px;
	}

	.sample-data-scroll::-webkit-scrollbar-track {
		background: #f1f5f9;
	}

	.sample-data-scroll::-webkit-scrollbar-thumb {
		background-color: #cbd5e1;
		border-radius: 9999px;
		border: 3px solid #f1f5f9;
	}

	.sample-data-scroll::-webkit-scrollbar-thumb:hover {
		background-color: #94a3b8;
	}

	.sample-data-scroll::-webkit-scrollbar-corner {
		background: #f1f5f9;
	}
</style>
