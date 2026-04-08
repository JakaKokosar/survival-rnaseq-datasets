import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import DatasetDetailHeader from './DatasetDetailHeader.svelte';
import type { Dataset } from '../../types/dataset';

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

	function renderHeader(dataset: Dataset) {
		render(DatasetDetailHeader, {
			props: {
				dataset,
				buildDataFileDownloadUrl: (filename: string) => `https://example.com/files/${filename}`,
				summariesMap: new Map(),
			},
		});
	}

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
});
