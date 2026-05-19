import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import DatasetDetailHeader from './DatasetDetailHeader.svelte';
import type { Dataset, GeoSeriesSummary } from '../../types/dataset';

describe('DatasetDetailHeader related publications', () => {
	afterEach(() => {
		cleanup();
	});

	function createDataset(overrides: Partial<Dataset> = {}): Dataset {
		return {
			data_id: 'GSE123',
			data_url: 'https://example.com/dataset',
			pmcids: ['PMC7446376'],
			related_publications: [
				{
					pmcid: 'PMC7446376',
					citation: 'Brueffer et al., JCO Precis Oncol, 2018',
					url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7446376/',
				},
			],
			'survival-endpoints': [],
			data_summary: {
				samples: 100,
				clinical_features: 5,
				genes: 1000,
			},
			'Experiment type': 'Expression profiling by high throughput sequencing',
			Reproducible: 'YES',
			'NCBI-generated data': 'Available',
			...overrides,
		};
	}

	function renderHeader(
		dataset: Dataset,
		overrides: {
			summariesMap?: Map<string, GeoSeriesSummary>;
			sampleOriginMap?: Map<string, string[]>;
		} = {},
	) {
		render(DatasetDetailHeader, {
			props: {
				dataset,
				buildDataFileDownloadUrl: (filename: string) => `https://example.com/files/${filename}`,
				summariesMap: overrides.summariesMap ?? new Map(),
				sampleOriginMap: overrides.sampleOriginMap ?? new Map(),
			},
		});
	}

	it('renders GEO id and series title as a single heading', () => {
		renderHeader(createDataset(), {
			summariesMap: new Map([
				[
					'GSE123',
					{
						data_id: 'GSE123',
						summary: 'Summary text',
						title: 'RNA-seq of 3273 SCAN-B breast tumors',
						cancer_type_exact: 'primary breast cancer',
						cancer_group: 'breast cancer',
					},
				],
			]),
		});

		expect(
			screen.getByRole('heading', {
				level: 2,
				name: 'GSE123 - RNA-seq of 3273 SCAN-B breast tumors',
			}),
		).toBeTruthy();
		expect(screen.queryByText('primary breast cancer')).toBeNull();
		expect(screen.queryByText('Expression profiling by high throughput sequencing')).toBeNull();
	});

	it('shows sample origin in metadata', () => {
		renderHeader(createDataset(), {
			sampleOriginMap: new Map([['GSE123', ['Sweden', 'United States']]]),
		});

		expect(screen.getByText('Sample origin:')).toBeTruthy();
		expect(screen.getByText('Sweden, United States')).toBeTruthy();
	});

	it('renders short citations as publication links instead of PMCIDs', () => {
		renderHeader(createDataset());

		expect(screen.getByText('Brueffer et al., JCO Precis Oncol, 2018')).toBeTruthy();
		expect(screen.queryByText('PMC7446376')).toBeNull();
	});

	it('keeps links pointing to the matching PMC article URL', () => {
		renderHeader(createDataset());

		const link = screen.getByRole('link', { name: /Brueffer et al\., JCO Precis Oncol, 2018/i });
		expect(link.getAttribute('href')).toBe('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7446376/');
		expect(link.getAttribute('title')).toBe('PMC7446376');
	});

	it('shows the empty state when no related publications are available', () => {
		renderHeader(
			createDataset({
				pmcids: [],
				related_publications: [],
			}),
		);

		expect(screen.getByText('No publications linked')).toBeTruthy();
	});

	it('renders dataset notes in a reproducibility warning tooltip', () => {
		const note = '10 samples are missing from the raw counts matrix.';
		renderHeader(createDataset({ Notes: note }));

		expect(screen.getByRole('button', { name: 'Reproducibility warning' })).toBeTruthy();
		expect(screen.getByRole('tooltip', { name: note })).toBeTruthy();
	});
});
