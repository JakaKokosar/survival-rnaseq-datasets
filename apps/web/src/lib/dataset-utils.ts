import type { Dataset, GeoSeriesSummary, NcbiDataValue, ReproducibleValue, SurvivalEndpoint } from '../types/dataset';

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
	DMFS: 'Distant Metastasis-Free Survival',
	BCR: 'Biochemical Recurrence',
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
	if (isEndpointIncomplete(ep)) return 'border-slate-400 border-dashed';
	if (hasEndpointWarnings(ep)) return 'border-slate-400';
	return 'border-slate-300';
}

// ── Sort Helpers ────────────────────────────────────────────────────

export type SortColumn = 'samples' | 'cancer';
export type SortDirection = 'asc' | 'desc';

const VALID_SORT_COLUMNS: ReadonlySet<string> = new Set<SortColumn>(['samples', 'cancer']);

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

function normalizeSortText(value: string): string {
	return value.trim().toLocaleLowerCase();
}

function getCancerSortValue(dataset: Dataset, summariesMap?: Map<string, GeoSeriesSummary>): string {
	return normalizeSortText(summariesMap?.get(dataset.data_id)?.cancer_group ?? dataset.data_id);
}

export function sortDatasets(
	datasets: Dataset[],
	column: SortColumn | null,
	direction: SortDirection | null,
	summariesMap?: Map<string, GeoSeriesSummary>,
): Dataset[] {
	if (!column || !direction) return datasets;
	return [...datasets].sort((a, b) => {
		let result: number;
		if (column === 'samples') {
			result = a.data_summary.samples - b.data_summary.samples;
		} else {
			result = getCancerSortValue(a, summariesMap).localeCompare(getCancerSortValue(b, summariesMap));
		}
		if (result === 0) result = a.data_id.localeCompare(b.data_id);
		return direction === 'asc' ? result : -result;
	});
}

// ── Search Helpers ─────────────────────────────────────────────────

function normalizeSearchText(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLocaleLowerCase()
		.trim();
}

export function filterDatasets(
	datasets: Dataset[],
	query: string,
	summariesMap?: Map<string, GeoSeriesSummary>,
): Dataset[] {
	const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return datasets;

	return datasets.filter((dataset) => {
		const summary = summariesMap?.get(dataset.data_id);
		const searchableText = normalizeSearchText(
			[
				dataset.data_id,
				summary?.cancer_group,
				summary?.cancer_type_exact,
				summary?.title,
				summary?.summary,
				...dataset['survival-endpoints'].flatMap((endpoint) => [
					endpoint.abbrv,
					getEndpointFullName(endpoint.abbrv),
				]),
			]
				.filter((value): value is string => typeof value === 'string' && value.length > 0)
				.join(' '),
		);

		return terms.every((term) => searchableText.includes(term));
	});
}

export interface SearchTextPart {
	text: string;
	isMatch: boolean;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getSearchTextParts(value: string, query: string): SearchTextPart[] {
	const terms = [
		...new Set(
			query
				.trim()
				.split(/\s+/)
				.map((term) => term.toLocaleLowerCase())
				.filter(Boolean),
		),
	].sort((a, b) => b.length - a.length);

	if (!value || terms.length === 0) return [{ text: value, isMatch: false }];

	const matcher = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'giu');
	return value
		.split(matcher)
		.map((text, index) => ({ text, isMatch: index % 2 === 1 }))
		.filter((part) => part.text.length > 0);
}

// ── URL Sync ────────────────────────────────────────────────────────

export interface UrlParams {
	selected: string | null;
	sort: SortColumn | null;
	direction: SortDirection | null;
	query: string;
}

export function readUrlParams(): UrlParams {
	const params = new URLSearchParams(window.location.search);
	const sort = params.get('sort');
	const dir = params.get('dir');
	return {
		selected: params.get('selected'),
		sort: sort && isValidSortColumn(sort) ? sort : null,
		direction: dir === 'desc' ? 'desc' : sort ? 'asc' : null,
		query: params.get('q')?.trim() ?? '',
	};
}

export function updateUrlParams(
	selectedId: string | null,
	sortColumn: SortColumn | null,
	sortDirection: SortDirection | null,
	query: string,
): void {
	const params = new URLSearchParams();
	if (selectedId) params.set('selected', selectedId);
	if (sortColumn && sortDirection) {
		params.set('sort', sortColumn);
		params.set('dir', sortDirection);
	}
	const normalizedQuery = query.trim();
	if (normalizedQuery) params.set('q', normalizedQuery);
	const url = params.toString()
		? `${window.location.pathname}?${params}`
		: window.location.pathname;
	history.replaceState(null, '', url);
}

// ── LocalStorage ────────────────────────────────────────────────────

const SPLIT_RATIO_KEY = 'datasetBrowserSplitRatio';
export const SPLIT_RATIO_MIN = 15;
export const SPLIT_RATIO_MAX = 60;

export function readSplitRatio(): number | null {
	const stored = parseFloat(localStorage.getItem(SPLIT_RATIO_KEY) ?? '');
	return Number.isFinite(stored) && stored >= SPLIT_RATIO_MIN && stored <= SPLIT_RATIO_MAX
		? stored
		: null;
}

export function saveSplitRatio(ratio: number): void {
	localStorage.setItem(SPLIT_RATIO_KEY, String(ratio));
}

export function clampSplitRatio(ratio: number): number {
	return Math.max(SPLIT_RATIO_MIN, Math.min(SPLIT_RATIO_MAX, ratio));
}
