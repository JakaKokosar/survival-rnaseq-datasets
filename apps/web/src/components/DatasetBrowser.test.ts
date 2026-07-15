import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DatasetBrowser from './DatasetBrowser.svelte';
import type { Dataset, GeoSeriesSummary } from '../types/dataset';

const dataset: Dataset = {
	data_id: 'GSE123',
	data_url: 'https://example.com/dataset',
	pmcids: [],
	related_publications: [],
	'survival-endpoints': [
		{
			abbrv: 'OS',
			time_var: { var_name: 'os_months', var_unit: 'months' },
			event_var: {
				var_name: 'os_event',
				var_values: ['0', '1'],
				var_meaning: '1 = death; 0 = censored',
			},
			notes: [],
		},
	],
	data_summary: {
		samples: 100,
		clinical_features: 5,
		genes: 1000,
	},
	'Experiment type': 'Expression profiling by high throughput sequencing',
	Reproducible: 'YES',
	'NCBI-generated data': 'Available',
};

const summariesMap = new Map<string, GeoSeriesSummary>([
	[
		'GSE123',
		{
			data_id: 'GSE123',
			summary: 'Dataset summary',
			title: 'Test survival dataset',
			cancer_type_exact: 'test cancer',
			cancer_group: 'test cancer',
		},
	],
]);

const originalFetch = globalThis.fetch;
const localStorageMock = (() => {
	let store = new Map<string, string>();
	return {
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => store.set(key, value)),
		clear: vi.fn(() => {
			store = new Map<string, string>();
		}),
	};
})();

Object.defineProperty(window, 'localStorage', {
	value: localStorageMock,
	configurable: true,
});

describe('DatasetBrowser detail sections', () => {
	beforeEach(() => {
		window.history.replaceState({}, '', '/');
		localStorageMock.clear();
		globalThis.fetch = vi.fn(async () => new Response('sample_id,os_months,os_event\nS1,12,1\n')) as unknown as typeof fetch;
	});

	afterEach(() => {
		cleanup();
		globalThis.fetch = originalFetch;
	});

	it('shows the summary directly and groups the analysis views in one tab row', async () => {
		const { container } = render(DatasetBrowser, {
			props: {
				datasets: [dataset],
				summariesMap,
				sampleOriginMap: new Map(),
			},
		});

		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'GSE123 - Test survival dataset' })).toBeTruthy();
		});

		expect(screen.queryByText('Data Summary')).toBeNull();
		const analysisTabs = within(screen.getByRole('tablist', { name: 'Dataset analysis' }));
		const kmTab = analysisTabs.getByRole('tab', { name: 'Kaplan-Meier Plot' });
		const sampleDataTab = analysisTabs.getByRole('tab', { name: 'Sample Data Viewer' });
		const endpointsTab = analysisTabs.getByRole('tab', { name: 'Survival Endpoints' });
		expect(analysisTabs.getAllByRole('tab')).toHaveLength(3);
		expect(kmTab.getAttribute('aria-selected')).toBe('true');
		expect(sampleDataTab.getAttribute('aria-selected')).toBe('false');
		expect(endpointsTab.getAttribute('aria-selected')).toBe('false');
		expect(container.querySelector('#detail-section-panel-km')).not.toBeNull();
		expect(container.querySelector('#detail-section-panel-sample-data')).toBeNull();
		expect(container.querySelector('#detail-section-panel-endpoints')).toBeNull();

		await fireEvent.click(sampleDataTab);
		expect(sampleDataTab.getAttribute('aria-selected')).toBe('true');
		expect(container.querySelector('#detail-section-panel-sample-data')).not.toBeNull();

		await fireEvent.click(endpointsTab);
		expect(endpointsTab.getAttribute('aria-selected')).toBe('true');
		expect(container.querySelector('#detail-section-panel-endpoints')).not.toBeNull();
	});
});
