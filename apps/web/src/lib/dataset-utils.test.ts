import { beforeEach, describe, expect, it } from 'vitest';
import { rawData, rawSummaries } from '../data';
import { parseDatasets, parseGeoSeriesSummaries } from './dataset-schema';
import type { Dataset, GeoSeriesSummary, SurvivalEndpoint } from '../types/dataset';
import {
	filterDatasets,
	getSearchTextParts,
	readUrlParams,
	sortDatasets,
	updateUrlParams,
} from './dataset-utils';

function createDataset(dataId: string, samples = 100): Dataset {
	return {
		data_id: dataId,
		data_url: `https://example.com/${dataId}`,
		pmcids: [],
		related_publications: [],
		'survival-endpoints': [],
		data_summary: {
			samples,
			clinical_features: 0,
			genes: 0,
		},
		'Experiment type': 'Expression profiling by high throughput sequencing',
		Reproducible: 'YES',
		'NCBI-generated data': 'Available',
	};
}

function createSummary(
	cancerGroup: string,
	overrides: Partial<GeoSeriesSummary> = {},
): GeoSeriesSummary {
	return {
		data_id: 'unused',
		summary: '',
		title: '',
		cancer_type_exact: '',
		cancer_group: cancerGroup,
		...overrides,
	};
}

function createEndpoint(abbrv: string): SurvivalEndpoint {
	return {
		abbrv,
		time_var: { var_name: `${abbrv.toLowerCase()}_time`, var_unit: 'months' },
		event_var: {
			var_name: `${abbrv.toLowerCase()}_event`,
			var_values: ['0', '1'],
			var_meaning: '0 = censored; 1 = event',
		},
		notes: [],
	};
}

describe('sortDatasets', () => {
	it('sorts cancer groups from GEO summaries', () => {
		const datasets = [createDataset('GSE2'), createDataset('GSE1')];
		const summariesMap = new Map<string, GeoSeriesSummary>([
			['GSE2', createSummary('melanoma')],
			['GSE1', createSummary('breast cancer')],
		]);

		const sorted = sortDatasets(datasets, 'cancer', 'asc', summariesMap);

		expect(sorted.map((dataset) => dataset.data_id)).toEqual(['GSE1', 'GSE2']);
	});
});

describe('filterDatasets', () => {
	const breastOne = createDataset('GSE96058', 3273);
	const breastTwo = createDataset('GSE113863', 119);
	const lung = {
		...createDataset('GSE229706', 150),
		'survival-endpoints': [createEndpoint('PFS')],
	};
	const datasets = [breastOne, breastTwo, lung];
	const summariesMap = new Map<string, GeoSeriesSummary>([
		[
			'GSE96058',
			createSummary('breast cancer', {
				title: 'RNA-seq of SCAN-B breast tumors',
				summary: 'Population-based multicenter cohort.',
			}),
		],
		[
			'GSE113863',
			createSummary('breast cancer', {
				title: 'Targeted RNA-seq of FFPE tumors',
				summary: 'Includes distant metastasis-free survival.',
			}),
		],
		[
			'GSE229706',
			createSummary('lung cancer', {
				cancer_type_exact: 'lung adenocarcinoma',
				title: 'Paired tumor and adjacent normal lung',
				summary: 'Clinical outcome annotations include recurrence.',
			}),
		],
	]);

	it('finds every partial cancer match', () => {
		expect(filterDatasets(datasets, 'bre', summariesMap).map((dataset) => dataset.data_id)).toEqual([
			'GSE96058',
			'GSE113863',
		]);
	});

	it('searches IDs, endpoints, titles, and summaries case-insensitively', () => {
		expect(filterDatasets(datasets, 'gse229', summariesMap)).toEqual([lung]);
		expect(filterDatasets(datasets, 'progression-free', summariesMap)).toEqual([lung]);
		expect(filterDatasets(datasets, 'scan-b', summariesMap)).toEqual([breastOne]);
		expect(filterDatasets(datasets, 'METASTASIS', summariesMap)).toEqual([breastTwo]);
	});

	it('requires every search term to be present', () => {
		expect(filterDatasets(datasets, 'lung pfs', summariesMap)).toEqual([lung]);
		expect(filterDatasets(datasets, 'lung dmfs', summariesMap)).toEqual([]);
	});

	it('finds every breast cancer dataset in the committed metadata', () => {
		const publishedDatasets = parseDatasets(rawData).map((dataset) => ({
			...dataset,
			related_publications: [],
		}));
		const publishedSummaries = parseGeoSeriesSummaries(rawSummaries);

		const matches = filterDatasets(publishedDatasets, 'breast cancer', publishedSummaries);

		expect(matches).toHaveLength(3);
		expect(matches.map((dataset) => dataset.data_id).sort()).toEqual(
			['GSE96058', 'GSE113863', 'GSE241876'].sort(),
		);
	});
});

describe('dataset browser URL state', () => {
	beforeEach(() => {
		history.replaceState(null, '', '/');
	});

	it('reads a shared search query from q', () => {
		history.replaceState(null, '', '/?selected=GSE229706&sort=cancer&dir=desc&q=lung%20cancer');

		expect(readUrlParams()).toEqual({
			selected: 'GSE229706',
			sort: 'cancer',
			direction: 'desc',
			query: 'lung cancer',
		});
	});

	it('writes and removes q while preserving selection and sort state', () => {
		updateUrlParams('GSE229706', 'samples', 'desc', ' lung cancer ');

		let params = new URLSearchParams(window.location.search);
		expect(params.get('selected')).toBe('GSE229706');
		expect(params.get('sort')).toBe('samples');
		expect(params.get('dir')).toBe('desc');
		expect(params.get('q')).toBe('lung cancer');

		updateUrlParams('GSE229706', 'samples', 'desc', '');
		params = new URLSearchParams(window.location.search);
		expect(params.has('q')).toBe(false);
	});
});

describe('getSearchTextParts', () => {
	it('marks every visible query term without changing the original text', () => {
		expect(getSearchTextParts('Breast Cancer', 'bre can')).toEqual([
			{ text: 'Bre', isMatch: true },
			{ text: 'ast ', isMatch: false },
			{ text: 'Can', isMatch: true },
			{ text: 'cer', isMatch: false },
		]);
	});

	it('treats search punctuation as literal text', () => {
		expect(getSearchTextParts('GSE(123)', 'gse(')).toEqual([
			{ text: 'GSE(', isMatch: true },
			{ text: '123)', isMatch: false },
		]);
	});
});
