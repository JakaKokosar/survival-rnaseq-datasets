import { describe, expect, it } from 'vitest';
import type { Dataset, GeoSeriesSummary } from '../types/dataset';
import { sortDatasets } from './dataset-utils';

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

function createSummary(cancerGroup: string): GeoSeriesSummary {
	return {
		data_id: 'unused',
		summary: '',
		title: '',
		cancer_type_exact: '',
		cancer_group: cancerGroup,
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
