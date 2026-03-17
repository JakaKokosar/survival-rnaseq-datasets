import type { Dataset, NcbiDataValue, ReproducibleValue, SurvivalEndpoint } from '../types/dataset';

// ── Display Formatters ──────────────────────────────────────────────

const EXPERIMENT_TYPE_ABBREVS = {
	'Expression profiling by high throughput sequencing': 'RNA-Seq',
	'Non-coding RNA profiling by high throughput sequencing': 'ncRNA-Seq',
	'non-coding RNA profiling by array': 'ncRNA Array',
} as const;

const ENDPOINT_FULL_NAMES = {
	OS: 'Overall Survival',
	DFS: 'Disease-Free Survival',
	PFS: 'Progression-Free Survival',
	RFS: 'Recurrence-Free Survival',
	PRS: 'Post-Relapse Survival',
	EFS: 'Event-Free Survival',
	DSS: 'Disease-Specific Survival',
	TTP: 'Time to Progression',
	DOR: 'Duration of Response',
} as const;

export function getExperimentTypeAbbrev(type: string): string {
	return EXPERIMENT_TYPE_ABBREVS[type as keyof typeof EXPERIMENT_TYPE_ABBREVS] ?? type;
}

export function getNcbiDataFormatted(value: NcbiDataValue): string {
	return value === 'Available' ? 'Yes' : 'No';
}

export function getReproducibleFormatted(value: ReproducibleValue): string {
	return value.charAt(0) + value.slice(1).toLowerCase();
}

export function getEndpointFullName(abbrv: string | undefined): string {
	if (!abbrv) return '';
	return ENDPOINT_FULL_NAMES[abbrv as keyof typeof ENDPOINT_FULL_NAMES] ?? '';
}

export function formatEventValues(values: string[] | string): string {
	if (values === 'unknown') return 'Not documented';
	if (Array.isArray(values)) return values.join(', ');
	return String(values);
}

// ── Endpoint Status ─────────────────────────────────────────────────

export function hasEndpointWarnings(ep: SurvivalEndpoint): boolean {
	return ep.notes?.length > 0;
}

export function isEndpointIncomplete(ep: SurvivalEndpoint): boolean {
	return (
		ep.time_var.var_name === 'unknown' ||
		ep.event_var.var_name === 'unknown'
	);
}

export function getEndpointCardBorderClass(ep: SurvivalEndpoint): string {
	if (isEndpointIncomplete(ep)) return 'border-slate-300 border-dashed';
	if (hasEndpointWarnings(ep)) return 'border-slate-300';
	return 'border-slate-200';
}

// ── Sort Helpers ────────────────────────────────────────────────────

export type SortColumn = 'samples';
export type SortDirection = 'asc' | 'desc';

const VALID_SORT_COLUMNS: ReadonlySet<string> = new Set<SortColumn>(['samples']);

export function isValidSortColumn(value: string): value is SortColumn {
	return VALID_SORT_COLUMNS.has(value);
}

export function sortIndicator(
	sortColumn: SortColumn | null,
	sortDirection: SortDirection | null,
	col: SortColumn,
): string {
	if (sortColumn !== col) return '';
	return sortDirection === 'asc' ? '↑' : '↓';
}

export function ariaSort(
	sortColumn: SortColumn | null,
	sortDirection: SortDirection | null,
	col: SortColumn,
): 'none' | 'ascending' | 'descending' {
	if (sortColumn !== col) return 'none';
	return sortDirection === 'asc' ? 'ascending' : 'descending';
}

function getSortValue(dataset: Dataset): number {
	return dataset.data_summary.samples;
}

export function sortDatasets(
	datasets: Dataset[],
	column: SortColumn | null,
	direction: SortDirection | null,
): Dataset[] {
	if (!column || !direction) return datasets;
	return [...datasets].sort((a, b) => {
		const aVal = getSortValue(a);
		const bVal = getSortValue(b);
		return direction === 'asc'
			? aVal - bVal
			: bVal - aVal;
	});
}

// ── URL Sync ────────────────────────────────────────────────────────

export interface UrlParams {
	selected: string | null;
	sort: SortColumn | null;
	direction: SortDirection | null;
}

export function readUrlParams(): UrlParams {
	const params = new URLSearchParams(window.location.search);
	const sort = params.get('sort');
	const dir = params.get('dir');
	return {
		selected: params.get('selected'),
		sort: sort && isValidSortColumn(sort) ? sort : null,
		direction: dir === 'desc' ? 'desc' : sort ? 'asc' : null,
	};
}

export function updateUrlParams(
	selectedId: string | null,
	sortColumn: SortColumn | null,
	sortDirection: SortDirection | null,
): void {
	const params = new URLSearchParams();
	if (selectedId) params.set('selected', selectedId);
	if (sortColumn && sortDirection) {
		params.set('sort', sortColumn);
		params.set('dir', sortDirection);
	}
	const url = params.toString()
		? `${window.location.pathname}?${params}`
		: window.location.pathname;
	history.replaceState(null, '', url);
}

// ── LocalStorage ────────────────────────────────────────────────────

const SPLIT_RATIO_KEY = 'datasetBrowserSplitRatio';
const SPLIT_RATIO_DEFAULT = 45;
const SPLIT_RATIO_MIN = 15;
const SPLIT_RATIO_MAX = 85;

export function readSplitRatio(): number {
	const stored = parseFloat(localStorage.getItem(SPLIT_RATIO_KEY) ?? '');
	return Number.isFinite(stored) && stored >= SPLIT_RATIO_MIN && stored <= SPLIT_RATIO_MAX
		? stored
		: SPLIT_RATIO_DEFAULT;
}

export function saveSplitRatio(ratio: number): void {
	localStorage.setItem(SPLIT_RATIO_KEY, String(ratio));
}

export function clampSplitRatio(ratio: number): number {
	return Math.max(SPLIT_RATIO_MIN, Math.min(SPLIT_RATIO_MAX, ratio));
}
