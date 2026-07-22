<script lang="ts">
	import { untrack } from 'svelte';
	import {
		computeHallmarkRanking,
		computeKm,
		getKmEnv,
		kmReady,
		type HallmarkRankingItem,
		type KmEnv,
		type KmPoint,
		type KmSeries,
	} from '../../lib/kmPython';
	import {
		getCachedHallmarkRanking,
		setCachedHallmarkRanking,
	} from '../../lib/hallmarkRankingCache';
	import { formatHallmarkName } from '../../lib/hallmarkNames';
	import {
		readHallmarkGroupingPreference,
		saveHallmarkGroupingPreference,
	} from '../../lib/hallmarkGroupingPreference';
	import { SPENDL_ET_AL_CITATION, SPENDL_ET_AL_PAPER_URL } from '../../lib/hallmarkAnalysis';
	import type { SurvivalEndpoint } from '../../types/dataset';

	interface Props {
		isOpen: boolean;
		showHeader?: boolean;
		onToggleOpen?: () => void;
		datasetId: string | null;
		endpoints: SurvivalEndpoint[];
	}

	const chartMargin = { top: 38, right: 30, bottom: 64, left: 66 };

	let { isOpen, showHeader = true, onToggleOpen, datasetId, endpoints }: Props = $props();
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
	let groupingEnabled = $state(readHallmarkGroupingPreference());
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
	let showConfidenceIntervals = $state(true);
	let showMedianSurvival = $state(true);
	let showCensoringTicks = $state(true);
	let displayExpanded = $state(true);

	let pyReady = $state(false);
	let pyEnv = $state<KmEnv | null>(null);
	let computing = $state(false);
	let pyError = $state<string | null>(null);
	let hallmarkRanking = $state.raw<HallmarkRankingItem[]>([]);
	let rankingComputing = $state(false);
	let rankingError = $state<string | null>(null);

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
				hallmarkRanking = [];
				kmChart = emptyChart();
				chartRenderKey += 1;
				pyError = null;
				rankingError = null;
			});
		}
	});

	let runId = 0;
	let csvCache = new Map<string, string>();
	let csvRequestCache = new Map<string, Promise<string>>();
	let lastComputeKey = '';

	function kmDataUrl(datasetId: string): string {
		const filename = `${datasetId}_preprocessed_ssgsea.csv`;
		return `/downloads/${encodeURIComponent(filename)}`;
	}

	async function loadDatasetCsv(id: string): Promise<string> {
		const cached = csvCache.get(id);
		if (cached !== undefined) return cached;
		const pending = csvRequestCache.get(id);
		if (pending) return pending;

		const request = (async () => {
			const response = await fetch(kmDataUrl(id));
			if (!response.ok) throw new Error(`Dataset "${id}" not found (HTTP ${response.status})`);
			const text = await response.text();
			csvCache.set(id, text);
			return text;
		})();
		csvRequestCache.set(id, request);
		try {
			return await request;
		} finally {
			csvRequestCache.delete(id);
		}
	}

	let rankingRunId = 0;
	$effect(() => {
		const id = datasetId;
		const currentEndpoint = endpoint;
		rankingRunId += 1;
		const myRun = rankingRunId;
		hallmarkRanking = [];
		rankingError = null;

		if (!id || !currentEndpoint) {
			rankingComputing = false;
			return;
		}

		const timeCol = currentEndpoint.time_var.var_name;
		const eventCol = currentEndpoint.event_var.var_name;
		const cached = getCachedHallmarkRanking(id, timeCol, eventCol);
		if (cached) {
			hallmarkRanking = cached.results;
			rankingComputing = false;
			return;
		}

		rankingComputing = true;
		(async () => {
			try {
				const [csv] = await Promise.all([loadDatasetCsv(id), kmReady()]);
				if (myRun !== rankingRunId) return;
				const result = await computeHallmarkRanking(csv, timeCol, eventCol);
				if (myRun !== rankingRunId) return;
				setCachedHallmarkRanking(id, timeCol, eventCol, result);
				hallmarkRanking = result.results;
				if (
					groupColumn !== '(None)' &&
					!result.results.some((item) => item.hallmark === groupColumn && item.status === 'ok')
				) {
					groupColumn = '(None)';
				}
			} catch (error) {
				if (myRun !== rankingRunId) return;
				rankingError = error instanceof Error ? error.message : String(error);
				hallmarkRanking = [];
			} finally {
				if (myRun === rankingRunId) rankingComputing = false;
			}
		})();
	});

	$effect(() => {
		const id = datasetId;
		const currentEndpoint = endpoint;
		const group = groupColumn === '(None)' ? null : groupColumn;
		runId += 1;
		const myRun = runId;

		if (!id || !currentEndpoint) {
			kmChart = emptyChart();
			chartRenderKey += 1;
			lastComputeKey = '';
			computing = false;
			pyError = null;
			return;
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
				const [csv] = await Promise.all([loadDatasetCsv(id), kmReady()]);
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
			} catch (error) {
				if (myRun !== runId) return;
				pyError = error instanceof Error ? error.message : String(error);
				kmChart = emptyChart();
				chartRenderKey += 1;
			} finally {
				if (myRun === runId) computing = false;
			}
		})();
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

	const hallmarkScoreFormatter = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
		useGrouping: false,
	});

	function formatLegendGroupLabel(label: string): string {
		const thresholdLabel = label.match(/^(<|>=)\s*(-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)$/i);
		if (!thresholdLabel) return label;

		const threshold = Number(thresholdLabel[2]);
		if (!Number.isFinite(threshold)) return label;
		return `${thresholdLabel[1]} ${hallmarkScoreFormatter.format(threshold)}`;
	}

	function formatPValue(value: number | null): string {
		if (value === null) return 'N/A';
		if (value < 0.001) return value.toExponential(2);
		return value.toFixed(3);
	}

	function rankingStatusLabel(item: HallmarkRankingItem): string {
		switch (item.status) {
			case 'invalid_split':
				return 'no median split';
			case 'no_events':
				return 'no events';
			case 'insufficient_data':
				return 'insufficient data';
			case 'not_estimable':
				return 'not estimable';
			default:
				return `p=${formatPValue(item.pValue)}`;
		}
	}

	function toggleGrouping(event: Event): void {
		groupingEnabled = (event.currentTarget as HTMLInputElement).checked;
		saveHallmarkGroupingPreference(groupingEnabled);
		if (!groupingEnabled) groupColumn = '(None)';
	}

	function selectHallmark(item: HallmarkRankingItem): void {
		if (item.status === 'ok') groupColumn = item.hallmark;
	}

	let hallmarkInfoButton = $state<HTMLButtonElement | undefined>(undefined);
	let hallmarkTooltipLeft = $state(0);
	let hallmarkTooltipTop = $state(0);
	let hallmarkTooltipSide = $state<'left' | 'right'>('right');
	let hallmarkTooltipOpen = $state(false);
	let hallmarkTooltipCloseTimer: ReturnType<typeof setTimeout> | undefined;

	function positionHallmarkTooltip(): void {
		if (!hallmarkInfoButton) return;

		const rect = hallmarkInfoButton.getBoundingClientRect();
		const tooltipWidth = 232;
		const viewportPadding = 8;
		const fitsOnRight = rect.right + tooltipWidth + viewportPadding <= window.innerWidth;
		hallmarkTooltipSide = fitsOnRight ? 'right' : 'left';
		hallmarkTooltipLeft = fitsOnRight
			? rect.right
			: Math.max(viewportPadding, rect.left - tooltipWidth);
		hallmarkTooltipTop = Math.min(
			Math.max(viewportPadding, rect.top - 8),
			Math.max(viewportPadding, window.innerHeight - 112),
		);
	}

	function clearHallmarkTooltipCloseTimer(): void {
		if (hallmarkTooltipCloseTimer !== undefined) {
			clearTimeout(hallmarkTooltipCloseTimer);
			hallmarkTooltipCloseTimer = undefined;
		}
	}

	function openHallmarkTooltip(): void {
		clearHallmarkTooltipCloseTimer();
		positionHallmarkTooltip();
		hallmarkTooltipOpen = true;
	}

	function keepHallmarkTooltipOpen(): void {
		clearHallmarkTooltipCloseTimer();
		hallmarkTooltipOpen = true;
	}

	function scheduleHallmarkTooltipClose(): void {
		clearHallmarkTooltipCloseTimer();
		hallmarkTooltipCloseTimer = setTimeout(() => {
			hallmarkTooltipOpen = false;
			hallmarkTooltipCloseTimer = undefined;
		}, 100);
	}

	function portalToBody(node: HTMLElement): () => void {
		const originalParent = node.parentNode;
		const originalNextSibling = node.nextSibling;
		document.body.appendChild(node);

		return () => {
			clearHallmarkTooltipCloseTimer();
			if (originalParent?.isConnected) {
				originalParent.insertBefore(node, originalNextSibling);
			} else {
				node.remove();
			}
		};
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

<section data-tour="km-analysis" class="km-analysis">
	{#if showHeader}
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
	{/if}
	{#if isOpen}
		<div id="km-plot-panel-content" class="km-panel-content min-w-0">
			<div class="km-workspace min-w-0">
				<div class="km-main min-w-0 font-sans text-slate-700">
					<div class="km-layout grid min-w-0">
						<aside
							class="km-controls flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
							aria-label="Kaplan-Meier controls"
						>
							<div
							data-tour="km-survival-endpoints"
							class={[
								'overflow-hidden bg-white',
								groupingEnabled ? 'km-survival-expanded' : 'shrink-0',
								]}
							>
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
								<div
							data-tour="km-grouping-variable"
							class={[
								'px-3 py-2.5 text-xs',
								groupingEnabled && 'km-grouping-expanded',
									]}
								>
									<div class="flex items-center gap-1">
										<label class="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
											<input
												type="checkbox"
												checked={groupingEnabled}
												onchange={toggleGrouping}
												aria-label="Group by"
												disabled={!datasetId || !endpoint}
												class="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
											/>
											<span class="font-medium">Group by hallmark</span>
										</label>
										<span class="relative inline-flex">
											<button
												bind:this={hallmarkInfoButton}
												type="button"
												onpointerenter={openHallmarkTooltip}
												onpointerleave={scheduleHallmarkTooltipClose}
												onfocus={openHallmarkTooltip}
												onblur={scheduleHallmarkTooltipClose}
												class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
												aria-label="About hallmark grouping"
												aria-describedby="hallmark-grouping-tooltip"
											>
												<svg
													aria-hidden="true"
													class="h-[18px] w-[18px]"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<circle cx="12" cy="12" r="9" stroke-width="1.8"></circle>
													<path stroke-linecap="round" stroke-width="1.8" d="M12 11v5"></path>
													<path stroke-linecap="round" stroke-width="2.4" d="M12 8h.01"></path>
												</svg>
											</button>
											<span
												{@attach portalToBody}
												id="hallmark-grouping-tooltip"
												role="tooltip"
												onpointerenter={keepHallmarkTooltipOpen}
												onpointerleave={scheduleHallmarkTooltipClose}
												onfocusin={keepHallmarkTooltipOpen}
												onfocusout={scheduleHallmarkTooltipClose}
												style:left={`${hallmarkTooltipLeft}px`}
												style:top={`${hallmarkTooltipTop}px`}
												class={[
													'fixed z-[100] w-[232px] transition-opacity duration-100',
													hallmarkTooltipOpen
														? 'pointer-events-auto visible opacity-100'
														: 'pointer-events-none invisible opacity-0',
													hallmarkTooltipSide === 'right' ? 'pl-2' : 'pr-2',
												]}
											>
												<span class="relative block rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-slate-600 shadow-lg">
													<span
														aria-hidden="true"
														class="absolute top-3 h-2 w-2 rotate-45 border-slate-200 bg-white {hallmarkTooltipSide === 'right' ? '-left-1 border-b border-l' : '-right-1 border-t border-r'}"
													></span>
													Hallmark ssGSEA scores summarize pathway activity per sample. Samples are
													median-split and ranked by survival differences.
													<a
														href={SPENDL_ET_AL_PAPER_URL}
														target="_blank"
														rel="noopener noreferrer"
														class="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
														>{SPENDL_ET_AL_CITATION}</a
													>.
												</span>
											</span>
										</span>
									</div>

								{#if groupingEnabled}
									<div
										class="km-ranking -mx-3 -mb-2.5 mt-2.5 overflow-hidden border-t border-slate-200 bg-white"
											data-testid="hallmark-ranking-list"
										>
											{#if rankingComputing}
												<div class="px-3 py-4 text-center text-[11px] text-slate-400" data-testid="hallmark-ranking-loading">
													Ranking hallmarks…
												</div>
											{:else if rankingError}
												<div class="px-3 py-4 text-[11px] text-red-600" data-testid="hallmark-ranking-error">
													{rankingError}
												</div>
											{:else if hallmarkRanking.length === 0}
												<div class="px-3 py-4 text-center text-[11px] text-slate-400">No hallmarks available</div>
											{:else}
											<div
												class="km-ranking-scroll max-h-64 overflow-y-auto"
													data-testid="hallmark-ranking-scroll"
												>
													<div
														class="sticky top-0 z-10 grid grid-cols-[72px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
													>
														<span>P-value</span>
														<span>Hallmark</span>
													</div>
													{#each hallmarkRanking as item (item.hallmark)}
														<button
															type="button"
															onclick={() => selectHallmark(item)}
															disabled={item.status !== 'ok'}
															aria-pressed={groupColumn === item.hallmark}
															aria-label={`${formatHallmarkName(item.hallmark)}, ${rankingStatusLabel(item)}`}
															title={item.hallmark}
															data-testid="hallmark-ranking-row"
															data-hallmark={item.hallmark}
															class="grid w-full grid-cols-[72px_minmax(0,1fr)] items-center border-b border-slate-100 px-2.5 py-2 text-left last:border-b-0 hover:bg-blue-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 {groupColumn === item.hallmark ? 'bg-blue-50 text-blue-800' : 'text-slate-700'}"
														>
															<span class="font-mono text-[10px] tabular-nums">{formatPValue(item.pValue)}</span>
															<span class="min-w-0 truncate text-xs font-medium">{formatHallmarkName(item.hallmark)}</span>
														</button>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
								</div>
							</div>

							<div class="shrink-0 overflow-hidden border-t border-slate-200 bg-white">
								<button
									type="button"
									onclick={() => (displayExpanded = !displayExpanded)}
									aria-expanded={displayExpanded}
									aria-controls="km-display-body"
									class="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50/90 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
								>
									<span>Display</span>
									<svg
										aria-hidden="true"
										class="h-3.5 w-3.5 transition-transform {displayExpanded ? 'rotate-180' : ''}"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
									</svg>
								</button>
								<div id="km-display-body" hidden={!displayExpanded}>
									<label class="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
										<input
											type="checkbox"
											bind:checked={showConfidenceIntervals}
											class="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
										/>
										<span>Show confidence intervals</span>
									</label>
									<label class="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
										<input
											type="checkbox"
											bind:checked={showMedianSurvival}
											class="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
										/>
										<span>Show median survival</span>
									</label>
									<label class="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
										<input
											type="checkbox"
											bind:checked={showCensoringTicks}
											class="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
										/>
										<span>Show censoring ticks</span>
									</label>
								</div>
							</div>

						</aside>

						<div data-tour="km-plot" class="min-h-0 w-full min-w-0">
							<div
								class="km-plot-frame relative min-h-[300px] w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
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
									<rect x="0" y="0" width={chart.width} height={chart.height} fill="white" />

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
											{@const formattedLabel = formatLegendGroupLabel(seriesItem.label)}
											<div
												class="legend-row grid grid-cols-[14px_minmax(0,1fr)_52px_52px] items-center gap-x-2 px-3 py-1.5 {index % 2 === 1 ? 'bg-slate-50/80' : ''}"
												data-testid="km-legend-row"
											>
												<span
													class="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
													style:background-color={seriesItem.color}
													aria-hidden="true"
												></span>
												<span class="truncate" title={formattedLabel}>{truncateLegendLabel(formattedLabel)}</span>
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
			<div
				data-testid="km-analysis-environment"
				class="mt-2 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 px-1 text-[10px] leading-snug text-slate-400"
			>
				<span>Analysis:</span>
				<a
					href="https://lifelines.readthedocs.io/"
					target="_blank"
					rel="noopener noreferrer"
					class="text-slate-500 hover:text-blue-600 hover:underline"
					>lifelines {pyEnv ? pyEnv.lifelines : 'loading…'}</a
				>
				<span aria-hidden="true">·</span>
				<span>Python {pyEnv ? pyEnv.python : 'loading…'}</span>
				<span aria-hidden="true">·</span>
				<span>
					Runs locally in your browser via
					<a
						href="https://pyscript.net/"
						target="_blank"
						rel="noopener noreferrer"
						class="text-slate-500 hover:text-blue-600 hover:underline">PyScript</a
					>
				</span>
			</div>
		</div>
	{/if}
</section>

<style>
	.km-workspace {
		container-type: inline-size;
		--km-panel-height: clamp(300px, calc(100vh - 34rem), 720px);
		--km-panel-height: clamp(300px, calc(100dvh - 34rem), 720px);
	}

	.km-plot-frame {
		height: var(--km-panel-height);
	}

	.km-layout {
		grid-template-columns: minmax(0, 1fr);
		gap: 0.75rem;
	}

	@container (min-width: 700px) {
		.km-layout {
			grid-template-columns: minmax(230px, 280px) minmax(0, 1fr);
		}

		.km-controls {
			height: var(--km-panel-height);
			min-height: 300px;
			overscroll-behavior: contain;
		}

		.km-survival-expanded,
		.km-grouping-expanded,
		.km-ranking {
			display: flex;
			min-height: 0;
			flex: 1 1 0%;
			flex-direction: column;
		}

		.km-ranking-scroll {
			min-height: 0;
			max-height: none;
			flex: 1 1 0%;
			overscroll-behavior: contain;
		}
	}

	@media (min-width: 1024px) and (max-height: 1050px) {
		.km-analysis,
		.km-panel-content,
		.km-workspace,
		.km-main,
		.km-layout {
			height: 100%;
			min-height: 0;
		}

		.km-panel-content {
			display: grid;
			grid-template-rows: minmax(0, 1fr) auto;
		}

		.km-workspace {
			--km-panel-height: 100%;
		}

		.km-controls,
		.km-plot-frame {
			min-height: 0;
		}
	}

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
