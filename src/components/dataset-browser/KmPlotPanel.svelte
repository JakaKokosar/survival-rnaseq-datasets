<script lang="ts">
	import { untrack } from 'svelte';
	import { computeKm, getKmEnv, kmReady, type KmEnv, type KmPoint, type KmSeries } from '../../lib/kmPython';
	import type { SurvivalEndpoint } from '../../types/dataset';

	interface Props {
		isOpen: boolean;
		onToggleOpen: () => void;
		datasetId: string | null;
		endpoints: SurvivalEndpoint[];
	}

	const NON_GROUP_CLINICAL_COLUMNS = new Set(['tumor.response', 'recist']);
	const chartMargin = { top: 38, right: 30, bottom: 64, left: 66 };

	let { isOpen, onToggleOpen, datasetId, endpoints }: Props = $props();
	/** Sized by ResizeObserver on the chart mount — chart fills box (no fixed aspect squeeze). */
	let plotBoxW = $state(680);
	let plotBoxH = $state(560);

	let chart = $derived({
		width: Math.max(300, plotBoxW),
		height: Math.max(260, plotBoxH),
		margin: chartMargin,
	});
	let plotWidth = $derived(chart.width - chart.margin.left - chart.margin.right);
	let plotHeight = $derived(chart.height - chart.margin.top - chart.margin.bottom);

	let endpointIndex = $state(0);
	let groupColumn = $state('(None)');
	let endpointResetKey = $derived(
		`${datasetId ?? ''}|${endpoints
			.map((ep) => `${ep.time_var.var_name}:${ep.event_var.var_name}`)
			.join('|')}`,
	);
	let lastEndpointResetKey = '';

	let endpoint = $derived(endpoints[endpointIndex] ?? null);
	let endpointLabel = $derived(endpoint?.abbrv ?? '');
	let timeAxisLabel = $derived.by(() => {
		const unit = endpoint?.time_var.var_unit?.trim();
		if (unit && unit.toLowerCase() !== 'unknown') return unit.charAt(0).toUpperCase() + unit.slice(1);
		const name = endpoint?.time_var.var_name?.toLowerCase() ?? '';
		if (name.includes('day')) return 'Days';
		if (name.includes('month') || name.includes('mos')) return 'Months';
		if (name.includes('year')) return 'Years';
		return 'Time';
	});
	let excludedKeys = $derived.by(() => {
		const set = new Set<string>(NON_GROUP_CLINICAL_COLUMNS);
		for (const ep of endpoints) {
			if (ep.time_var?.var_name) set.add(ep.time_var.var_name);
			if (ep.event_var?.var_name) set.add(ep.event_var.var_name);
		}
		return set;
	});
	let showConfidenceIntervals = $state(true);
	let showMedianSurvival = $state(true);
	let showCensoringTicks = $state(true);

	let pyReady = $state(false);
	let pyEnv = $state<KmEnv | null>(null);
	let envOpen = $state(false);
	let computing = $state(false);
	let pyError = $state<string | null>(null);
	let numericGroupOptions = $state<string[]>([]);

	type KmChartState = {
		series: KmSeries[];
		maxTime: number;
	};

	const emptyChart = (): KmChartState => ({ series: [], maxTime: 1 });
	let kmChart = $state<KmChartState>(emptyChart());
	let chartRenderKey = $state(0);
	let maxTime = $derived(kmChart.maxTime);
	let xTicks = $derived(getTicks(maxTime, 10));
	let yTicks = [0, 0.25, 0.5, 0.75, 1];

	$effect(() => {
		if (endpointResetKey !== lastEndpointResetKey) {
			lastEndpointResetKey = endpointResetKey;
			untrack(() => {
				endpointIndex = 0;
				groupColumn = '(None)';
				numericGroupOptions = [];
				kmChart = emptyChart();
				chartRenderKey += 1;
				pyError = null;
			});
		}
	});

	let runId = 0;
	let csvCache = new Map<string, string>();
	let activeAbort: AbortController | null = null;
	let lastComputeKey = '';

	function kmDataUrl(datasetId: string): string {
		const filename = `${datasetId}_preprocessed_ssgsea.csv`;
		return `/downloads/${encodeURIComponent(filename)}`;
	}

	async function loadDatasetCsv(id: string, signal: AbortSignal): Promise<string> {
		const cached = csvCache.get(id);
		if (cached !== undefined) return cached;
		const response = await fetch(kmDataUrl(id), { signal });
		if (!response.ok) throw new Error(`Dataset "${id}" not found (HTTP ${response.status})`);
		const text = await response.text();
		csvCache.set(id, text);
		return text;
	}

	$effect(() => {
		const id = datasetId;
		const currentEndpoint = endpoint;
		const group = groupColumn === '(None)' ? null : groupColumn;
		runId += 1;
		const myRun = runId;
		if (activeAbort) activeAbort.abort();
		const abort = new AbortController();
		activeAbort = abort;
		const excluded = excludedKeys;

		if (!id || !currentEndpoint) {
			kmChart = emptyChart();
			chartRenderKey += 1;
			numericGroupOptions = [];
			lastComputeKey = '';
			computing = false;
			pyError = null;
			return () => {
				abort.abort();
				if (activeAbort === abort) activeAbort = null;
			};
		}

		const timeCol = currentEndpoint.time_var.var_name;
		const eventCol = currentEndpoint.event_var.var_name;
		const computeKey = `${id}|${timeCol}|${eventCol}|${group ?? ''}`;
		if (computeKey !== lastComputeKey) {
			lastComputeKey = computeKey;
			kmChart = emptyChart();
			chartRenderKey += 1;
		}
		computing = true;
		pyError = null;
		(async () => {
			try {
				const [csv] = await Promise.all([loadDatasetCsv(id, abort.signal), kmReady()]);
				if (myRun !== runId) return;
				pyReady = true;
				if (!pyEnv) pyEnv = getKmEnv();
				const result = await computeKm(csv, timeCol, eventCol, group);
				if (myRun !== runId) return;
				if (import.meta.env.DEV) {
					console.debug('[KmPlotPanel] computeKm result', {
						datasetId: id,
						timeCol,
						eventCol,
						group,
						seriesCount: result.series.length,
						labels: result.series.map((item) => item.label),
					});
				}
				const times = result.series.flatMap((s) => s.points.map((p) => p.time));
				kmChart = {
					series: result.series,
					maxTime: times.length > 0 ? Math.max(1, ...times) : 1,
				};
				chartRenderKey += 1;
				const availableGroups = result.numericColumns.filter((column) => !excluded.has(column));
				numericGroupOptions = availableGroups;
				if (group !== null && !availableGroups.includes(group)) {
					groupColumn = '(None)';
				}
			} catch (error) {
				if (myRun !== runId) return;
				if ((error as { name?: string })?.name === 'AbortError') return;
				pyError = error instanceof Error ? error.message : String(error);
				kmChart = emptyChart();
				chartRenderKey += 1;
			} finally {
				if (myRun === runId) computing = false;
				if (activeAbort === abort) activeAbort = null;
			}
		})();

		return () => {
			abort.abort();
			if (activeAbort === abort) activeAbort = null;
		};
	});

	function xScale(time: number): number {
		return chart.margin.left + (time / maxTime) * plotWidth;
	}

	function yScale(survival: number): number {
		return chart.margin.top + (1 - survival) * plotHeight;
	}

	function stepPath(points: KmPoint[]): string {
		if (points.length === 0) return '';

		const commands = [`M ${xScale(0)} ${yScale(1)}`];
		for (const point of points.slice(1)) {
			commands.push(`H ${xScale(point.time)}`);
			commands.push(`V ${yScale(point.survival)}`);
		}
		commands.push(`H ${xScale(maxTime)}`);
		return commands.join(' ');
	}

	function confidencePath(points: KmPoint[]): string {
		if (points.length === 0) return '';
		const upper = stepBand(points, 'ciHigh');
		const lower = stepBand(points, 'ciLow').reverse();
		return [...upper, ...lower].map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ') + ' Z';
	}

	function stepBand(points: KmPoint[], key: 'ciLow' | 'ciHigh'): { x: number; y: number }[] {
		const band: { x: number; y: number }[] = [{ x: xScale(0), y: yScale(points[0]?.[key] ?? 1) }];
		for (const point of points.slice(1)) {
			const previous = band[band.length - 1];
			band.push({ x: xScale(point.time), y: previous.y });
			band.push({ x: xScale(point.time), y: yScale(point[key]) });
		}
		band.push({ x: xScale(maxTime), y: band[band.length - 1].y });
		return band;
	}

	function medianPath(seriesItem: KmSeries): string {
		if (seriesItem.median === null) return '';
		const medianY = yScale(0.5);
		const medianX = xScale(seriesItem.median);
		return `M ${xScale(0)} ${medianY} H ${medianX} V ${yScale(0)}`;
	}

	function getTicks(max: number, targetCount: number): number[] {
		const step = niceStep(max / targetCount);
		const ticks: number[] = [];
		for (let tick = 0; tick <= max + step * 0.5; tick += step) {
			ticks.push(Number(tick.toFixed(10)));
		}
		return ticks;
	}

	function niceStep(rawStep: number): number {
		const power = 10 ** Math.floor(Math.log10(rawStep));
		const fraction = rawStep / power;
		if (fraction <= 1) return power;
		if (fraction <= 2) return 2 * power;
		if (fraction <= 5) return 5 * power;
		return 10 * power;
	}

	function formatNumber(value: number | null | undefined): string {
		if (value === null || value === undefined) return 'N/A';
		return Number(value.toFixed(1)).toString();
	}

	function truncateLegendLabel(label: string, maxLength = 26): string {
		if (label.length <= maxLength) return label;
		return `${label.slice(0, maxLength - 1)}…`;
	}

	const legendW = 260;
	const legendPad = 12;
	const legendRowH = 22;
	const legendHeaderH = 30;

	let svgRoot = $state<SVGSVGElement | undefined>(undefined);
	/** Pixels inset from chart top-right edge (recalibrated on resize / pointer up — keeps legend anchored). */
	let legendInsetRight = $state(16);
	let legendInsetTop = $state(20);

	let legendHeight = $derived(legendHeaderH + kmChart.series.length * legendRowH + legendPad);

	let legendPose = $derived.by(() => {
		const cw = chart.width;
		const ch = chart.height;
		const lh = legendHeight;
		const maxLeft = Math.max(0, cw - legendW);
		const maxTop = Math.max(0, ch - lh);
		const left = Math.min(Math.max(cw - legendW - legendInsetRight, 0), maxLeft);
		const top = Math.min(Math.max(legendInsetTop, 0), maxTop);
		return { left, top };
	});

	let legendOverlayStyle = $derived({
		left: `${(legendPose.left / chart.width) * 100}%`,
		top: `${(legendPose.top / chart.height) * 100}%`,
		width: `${legendW}px`,
	});

	function rebalanceLegendInsets(chartWidth: number, chartHeight: number): void {
		const lh = legendHeaderH + kmChart.series.length * legendRowH + legendPad;
		const maxLeft = Math.max(0, chartWidth - legendW);
		const maxTop = Math.max(0, chartHeight - lh);
		const desiredLeft = Math.min(Math.max(chartWidth - legendW - legendInsetRight, 0), maxLeft);
		const desiredTop = Math.min(Math.max(legendInsetTop, 0), maxTop);
		const nextInsetRight = chartWidth - legendW - desiredLeft;
		const nextInsetTop = desiredTop;
		if (legendInsetRight !== nextInsetRight) legendInsetRight = nextInsetRight;
		if (legendInsetTop !== nextInsetTop) legendInsetTop = nextInsetTop;
	}

	function syncPlotBoxFromNode(node: HTMLElement) {
		const rawW = Math.floor(node.clientWidth);
		const rawH = Math.floor(node.clientHeight);
		const cw = Math.max(300, rawW >= 32 ? rawW : 680);
		const ch = Math.max(260, rawH >= 32 ? rawH : 560);
		plotBoxW = cw;
		plotBoxH = ch;
		rebalanceLegendInsets(cw, ch);
	}

	function attachPlotResize(node: HTMLElement): () => void {
		syncPlotBoxFromNode(node);
		if (typeof ResizeObserver === 'undefined') {
			return () => {};
		}
		const ro = new ResizeObserver(() => syncPlotBoxFromNode(node));
		ro.observe(node);
		return () => ro.disconnect();
	}

	let legendDrag = $state<{
		pointerId: number;
		startClientX: number;
		startClientY: number;
		originInsetRight: number;
		originInsetTop: number;
	} | null>(null);

	function onLegendPointerDown(e: PointerEvent) {
		if (!svgRoot) return;
		e.preventDefault();
		const target = e.currentTarget;
		if (target instanceof Element) target.setPointerCapture(e.pointerId);
		legendDrag = {
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			originInsetRight: legendInsetRight,
			originInsetTop: legendInsetTop,
		};
	}

	function onLegendPointerMove(e: PointerEvent) {
		if (!legendDrag || e.pointerId !== legendDrag.pointerId || !svgRoot) return;
		const rect = svgRoot.getBoundingClientRect();
		const dx = e.clientX - legendDrag.startClientX;
		const dy = e.clientY - legendDrag.startClientY;
		const svgDx = rect.width > 0 ? (dx / rect.width) * chart.width : 0;
		const svgDy = rect.height > 0 ? (dy / rect.height) * chart.height : 0;
		legendInsetRight = legendDrag.originInsetRight - svgDx;
		legendInsetTop = legendDrag.originInsetTop + svgDy;
	}

	function onLegendPointerUp(e: PointerEvent) {
		if (legendDrag?.pointerId === e.pointerId) {
			legendDrag = null;
			untrack(() => rebalanceLegendInsets(chart.width, chart.height));
		}
	}

	/** When row count changes the legend grows/shrinks; keep insets clamped without waiting for ResizeObserver */
	$effect(() => {
		const w = chart.width;
		const h = chart.height;
		void legendHeight;
		untrack(() => rebalanceLegendInsets(w, h));
	});
</script>

<section data-tour="km-analysis">
	<button
		onclick={onToggleOpen}
		aria-expanded={isOpen}
		aria-controls="km-plot-panel-content"
		class="mb-3 flex w-full cursor-pointer items-center gap-2 text-left text-slate-600 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
	>
		<svg
			class="h-4 w-4 text-slate-400 {isOpen ? 'rotate-90' : ''}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
		</svg>
		<h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Kaplan-Meier plot</h3>
	</button>
	{#if isOpen}
		<div id="km-plot-panel-content">
			<div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
				<div data-tour="km-plot" class="font-sans text-slate-700">
					<div class="grid gap-8 p-5 lg:grid-cols-[minmax(230px,_280px)_minmax(0,_1fr)] lg:items-start lg:gap-8 xl:gap-10">
						<aside
							class="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
							aria-label="Kaplan-Meier controls"
						>
							<div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
								<div
									class="border-b border-slate-100 bg-slate-50/90 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
								>
									Survival variables
								</div>
								<label class="flex flex-col gap-1.5 border-b border-slate-50 px-3 py-2.5 text-xs last:border-b-0">
									<span class="font-medium text-slate-500">Time</span>
									<select
										bind:value={endpointIndex}
										aria-label="Survival endpoint"
										disabled={endpoints.length === 0}
										class="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
									>
										{#if endpoints.length === 0}
											<option value={0}>(no endpoints)</option>
										{:else}
											{#each endpoints as ep, index (index)}
												<option value={index}>{ep.time_var.var_name}{ep.abbrv ? ` (${ep.abbrv})` : ''}</option>
											{/each}
										{/if}
									</select>
								</label>
								<label class="flex flex-col gap-1.5 border-b border-slate-50 px-3 py-2.5 text-xs last:border-b-0">
									<span class="font-medium text-slate-500">Event</span>
									<select
										bind:value={endpointIndex}
										aria-label="Event endpoint"
										disabled={endpoints.length === 0}
										class="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
									>
										{#if endpoints.length === 0}
											<option value={0}>(no endpoints)</option>
										{:else}
											{#each endpoints as ep, index (index)}
												<option value={index}>{ep.event_var.var_name}{ep.abbrv ? ` (${ep.abbrv})` : ''}</option>
											{/each}
										{/if}
									</select>
								</label>
								<label class="flex flex-col gap-1.5 px-3 py-2.5 text-xs">
									<span class="leading-snug font-medium text-slate-500">
										Group by <span class="font-normal text-slate-400">(optional)</span>
									</span>
									<select
										bind:value={groupColumn}
										aria-label="Group by"
										class="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
									>
										<option value="(None)">(None)</option>
										{#each numericGroupOptions as option (option)}
											<option value={option}>{option}</option>
										{/each}
									</select>
								</label>
							</div>

							<div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
								<div
									class="border-b border-slate-100 bg-slate-50/90 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
								>
									Display
								</div>
								<label class="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
									<input
										type="checkbox"
										bind:checked={showConfidenceIntervals}
										class="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
									/>
									<span>Show confidence intervals</span>
								</label>
								<label class="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
									<input
										type="checkbox"
										bind:checked={showMedianSurvival}
										class="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
									/>
									<span>Show median survival</span>
								</label>
								<label class="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
									<input
										type="checkbox"
										bind:checked={showCensoringTicks}
										class="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
									/>
									<span>Show censoring ticks</span>
								</label>
							</div>

							<div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
								<button
									type="button"
									onclick={() => (envOpen = !envOpen)}
									aria-expanded={envOpen}
									aria-controls="km-analysis-env-body"
									class="flex w-full cursor-pointer items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
								>
									<span>Analysis environment</span>
									<svg
										class="h-3 w-3 text-slate-400 transition-transform {envOpen ? 'rotate-90' : ''}"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
									</svg>
								</button>
								{#if envOpen}
									<div id="km-analysis-env-body" class="px-3 py-2.5 text-xs text-slate-600">
										<p class="mb-2 leading-snug text-slate-500">
											Kaplan–Meier analysis is done using
											<a
												href="https://lifelines.readthedocs.io/"
												target="_blank"
												rel="noopener noreferrer"
												class="text-blue-600 hover:underline">lifelines</a>.
										</p>
										<dl class="divide-y divide-slate-100 border-y border-slate-100">
											<div class="flex items-center justify-between py-1.5">
												<dt class="text-slate-500">Python</dt>
												<dd class="font-mono text-[11px] text-slate-700">
													{pyEnv ? pyEnv.python : 'loading…'}
												</dd>
											</div>
											<div class="flex items-center justify-between py-1.5">
												<dt class="text-slate-500">lifelines</dt>
												<dd class="font-mono text-[11px] text-slate-700">
													{pyEnv ? pyEnv.lifelines : 'loading…'}
												</dd>
											</div>
										</dl>
										<p class="mt-2 text-[10px] leading-snug text-slate-400">
											Executed in your browser via
											<a
												href="https://pyscript.net/"
												target="_blank"
												rel="noopener noreferrer"
												class="text-blue-500 hover:underline">PyScript</a>.
										</p>
									</div>
								{/if}
							</div>
						</aside>

						<div class="relative w-full min-w-0 min-h-0">
							<div
								class="relative h-[min(68vh,720px)] min-h-[300px] w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-inner"
								{@attach attachPlotResize}
							>
								{#if !pyReady}
									<div class="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-sm text-slate-500" data-testid="km-py-loading">
										Loading Python runtime…
									</div>
								{:else if computing}
									<div class="absolute right-3 top-3 z-10 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-500 shadow-sm" data-testid="km-py-computing">
										computing…
									</div>
								{/if}
								{#if pyError}
									<div class="absolute left-3 top-3 z-10 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 shadow-sm" data-testid="km-py-error">
										{pyError}
									</div>
								{/if}
								<svg
									bind:this={svgRoot}
									class="km-chart text-slate-700 block h-full w-full"
									role="img"
									aria-label={`Kaplan-Meier ${endpointLabel} survival chart`}
									viewBox={`0 0 ${chart.width} ${chart.height}`}
								>
								<rect x="0" y="0" width={chart.width} height={chart.height} fill="white" stroke="#e2e8f0" />

								<g class="grid">
									{#each yTicks as tick (tick)}
										<line
											x1={chart.margin.left}
											x2={chart.width - chart.margin.right}
											y1={yScale(tick)}
											y2={yScale(tick)}
										/>
									{/each}
								</g>

								{#if showConfidenceIntervals}
									<g data-testid="km-confidence-layer">
										{#each kmChart.series as seriesItem (`${chartRenderKey}-${seriesItem.key}`)}
											<path d={confidencePath(seriesItem.points)} fill={seriesItem.color} opacity="0.18" />
										{/each}
									</g>
								{/if}

								<g class="axes">
									<line
										x1={chart.margin.left}
										x2={chart.margin.left}
										y1={chart.margin.top}
										y2={chart.height - chart.margin.bottom}
									/>
									<line
										x1={chart.margin.left}
										x2={chart.width - chart.margin.right}
										y1={chart.height - chart.margin.bottom}
										y2={chart.height - chart.margin.bottom}
									/>
									{#each xTicks as tick (tick)}
										<g>
											<line
												x1={xScale(tick)}
												x2={xScale(tick)}
												y1={chart.height - chart.margin.bottom}
												y2={chart.height - chart.margin.bottom + 6}
											/>
											<text x={xScale(tick)} y={chart.height - chart.margin.bottom + 22} text-anchor="middle">
												{tick}
											</text>
										</g>
									{/each}
									{#each yTicks as tick (tick)}
										<g>
											<line
												x1={chart.margin.left - 6}
												x2={chart.margin.left}
												y1={yScale(tick)}
												y2={yScale(tick)}
											/>
											<text x={chart.margin.left - 12} y={yScale(tick) + 4} text-anchor="end">
												{tick.toFixed(2).replace(/0$/, '')}
											</text>
										</g>
									{/each}
									<text
										x={chart.margin.left + plotWidth / 2}
										y={chart.height - 18}
										text-anchor="middle"
										class="axis-title">{timeAxisLabel}</text
									>
									<text
										x={18}
										y={chart.margin.top + plotHeight / 2}
										text-anchor="middle"
										transform={`rotate(-90 18 ${chart.margin.top + plotHeight / 2})`}
										class="axis-title">Survival Probability</text
									>
								</g>

								{#if showMedianSurvival}
									<g data-testid="km-median-layer">
										{#each kmChart.series as seriesItem (`${chartRenderKey}-${seriesItem.key}`)}
											<path d={medianPath(seriesItem)} stroke={seriesItem.color} stroke-dasharray="3 4" />
										{/each}
									</g>
								{/if}

								<g data-testid="km-series-layer">
									{#each kmChart.series as seriesItem (`${chartRenderKey}-${seriesItem.key}`)}
										<path d={stepPath(seriesItem.points)} fill="none" stroke={seriesItem.color} stroke-width="2.25" />
									{/each}
								</g>

								{#if showCensoringTicks}
									<g data-testid="km-censor-layer">
										{#each kmChart.series as seriesItem (`${chartRenderKey}-${seriesItem.key}`)}
											{#each seriesItem.censorTicks as tick, index (`${chartRenderKey}-${seriesItem.key}-${index}`)}
												<path
													d={`M ${xScale(tick.time)} ${yScale(tick.survival) - 4} V ${yScale(tick.survival) + 4}`}
													stroke={seriesItem.color}
													stroke-width="2"
												/>
											{/each}
										{/each}
									</g>
								{/if}

							</svg>

							<div
								data-testid="km-legend"
								class="legend-overlay absolute z-20 touch-none select-none"
								style:left={legendOverlayStyle.left}
								style:top={legendOverlayStyle.top}
								style:width={legendOverlayStyle.width}
								role="group"
								aria-label="Chart legend — drag to move"
								onpointerdown={onLegendPointerDown}
								onpointermove={onLegendPointerMove}
								onpointerup={onLegendPointerUp}
								onpointercancel={onLegendPointerUp}
							>
								<div class="overflow-hidden rounded border border-slate-300 bg-white text-xs text-slate-700 shadow-sm">
									<div class="grid grid-cols-[14px_minmax(0,1fr)_52px_52px] items-center gap-x-2 border-b border-slate-200 px-3 py-2 font-semibold text-slate-500">
										<span aria-hidden="true"></span>
										<span>Group</span>
										<span class="text-right">n/N</span>
										<span class="text-right">Median</span>
									</div>
									{#if kmChart.series.length === 0}
										<div class="px-3 py-2 text-slate-400" data-testid="km-legend-empty">No groups</div>
									{:else}
										{#each kmChart.series as seriesItem, index (`${chartRenderKey}-${index}-${seriesItem.key}`)}
											<div
												class="legend-row grid grid-cols-[14px_minmax(0,1fr)_52px_52px] items-center gap-x-2 px-3 py-1.5 {index % 2 === 1 ? 'bg-slate-50/80' : ''}"
												data-testid="km-legend-row"
											>
												<span
													class="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
													style:background-color={seriesItem.color}
													aria-hidden="true"
												></span>
												<span class="truncate" title={seriesItem.label}>{truncateLegendLabel(seriesItem.label)}</span>
												<span class="text-right tabular-nums">{seriesItem.events}/{seriesItem.total}</span>
												<span class="text-right tabular-nums">{formatNumber(seriesItem.median)}</span>
											</div>
										{/each}
									{/if}
								</div>
							</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</section>

<style>
	.km-chart {
		display: block;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		font-family: ui-sans-serif, system-ui, sans-serif;
		background: transparent;
	}

	.grid line {
		stroke: #f1f5f9;
		stroke-width: 1;
	}

	.axes line {
		stroke: #64748b;
		stroke-width: 1;
	}

	.axes text {
		fill: currentColor;
		font-size: 12px;
	}

	.axis-title {
		font-size: 14px;
		fill: #475569;
	}

	.legend-overlay {
		cursor: grab;
	}

	.legend-overlay:active {
		cursor: grabbing;
	}

	[data-testid='km-median-layer'] path {
		fill: none;
		stroke-width: 1.3;
		opacity: 0.65;
	}
</style>
