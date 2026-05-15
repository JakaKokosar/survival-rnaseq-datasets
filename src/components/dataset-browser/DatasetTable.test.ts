import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DatasetTable from './DatasetTable.svelte';
import type { Component } from 'svelte';
import type { SortColumn, SortDirection } from '../../lib/dataset-utils';
import type { Dataset, GeoSeriesSummary } from '../../types/dataset';

interface DatasetTableProps {
	panelElement?: HTMLDivElement | null;
	panelId: string;
	panelLabelledBy: string;
	sortedDatasets: Dataset[];
	selectedId: string | null;
	focusedIndex: number;
	isTbodyFocused: boolean;
	sortColumn: SortColumn | null;
	sortDirection: SortDirection | null;
	mobileTab: 'list' | 'details';
	isDesktop: boolean;
	summariesMap: Map<string, GeoSeriesSummary>;
	sampleOriginMap: Map<string, string[]>;
	onSort: (column: SortColumn) => void;
	onSelectDataset: (id: string) => void;
	onListboxKeydown: (event: KeyboardEvent) => void;
	onListboxFocus: () => void;
	onListboxBlur: () => void;
}

function createDataset(overrides: Partial<Dataset> = {}): Dataset {
	return {
		data_id: 'GSE123',
		data_url: 'https://example.com/dataset',
		pmcids: [],
		related_publications: [],
		'survival-endpoints': [
			{
				abbrv: 'OS',
				time_var: {
					var_name: 'os_months',
					var_unit: 'months',
				},
				event_var: {
					var_name: 'os_event',
					var_values: ['0', '1'],
					var_meaning: '1 = death; 0 = censored',
				},
				notes: [],
				stats: {
					n_incomplete: 5,
					n_complete: 95,
					n_censored: 46,
					n_events: 49,
					censored_ratio: 0.48,
				},
			},
			{
				abbrv: 'DOR',
				time_var: {
					var_name: 'dor_months',
					var_unit: 'months',
				},
				event_var: {
					var_name: 'dor_event',
					var_values: ['0', '1'],
					var_meaning: '1 = event; 0 = censored',
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
		...overrides,
	};
}

function renderTable(sortedDatasets: Dataset[], overrides: Partial<DatasetTableProps> = {}) {
	return render(DatasetTable as unknown as Component<DatasetTableProps>, {
		props: {
			panelId: 'dataset-table-panel',
			panelLabelledBy: 'dataset-table-tab',
			sortedDatasets,
			selectedId: null,
			focusedIndex: -1,
			isTbodyFocused: false,
			sortColumn: null,
			sortDirection: null,
			mobileTab: 'list',
			isDesktop: true,
			summariesMap: new Map<string, GeoSeriesSummary>(),
			sampleOriginMap: new Map(sortedDatasets.map((dataset) => [dataset.data_id, ['United States']])),
			onSort: vi.fn(),
			onSelectDataset: vi.fn(),
			onListboxKeydown: vi.fn(),
			onListboxFocus: vi.fn(),
			onListboxBlur: vi.fn(),
			...overrides,
		},
	});
}

describe('DatasetTable endpoint stats', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders endpoint metrics as grouped rows with placeholders', () => {
		const noCompleteEndpoints = createDataset({
			data_id: 'GSE456',
			'survival-endpoints': [
				{
					abbrv: 'PFS',
					time_var: {
						var_name: 'unknown',
						var_unit: 'unknown',
					},
					event_var: {
						var_name: 'pfs_event',
						var_values: ['0', '1'],
						var_meaning: '1 = event; 0 = censored',
					},
					notes: [],
				},
			],
		});

		const { container } = renderTable([createDataset(), noCompleteEndpoints]);

		expect(screen.getByRole('columnheader', { name: 'Endpoint Complete Censored' })).toBeTruthy();
		expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual([
			'# SAMPLES',
			'SAMPLE ORIGIN',
			'CANCER',
			'Endpoint Complete Censored',
		]);

		const statsRow = container.querySelector('[data-dataset-id="GSE123"]');
		expect(statsRow).not.toBeNull();
		expect(within(statsRow as HTMLElement).getByText('OS')).toBeTruthy();
		expect(within(statsRow as HTMLElement).getByText('DOR')).toBeTruthy();
		expect(within(statsRow as HTMLElement).getByText('48%')).toBeTruthy();
		expect(within(statsRow as HTMLElement).getByText('95%')).toBeTruthy();
		expect(within(statsRow as HTMLElement).getAllByText('—').length).toBe(2);

		const emptyRow = container.querySelector('[data-dataset-id="GSE456"]');
		expect(emptyRow).not.toBeNull();
		expect(within(emptyRow as HTMLElement).getByLabelText('No complete endpoints')).toBeTruthy();
		expect(within(emptyRow as HTMLElement).getByText('No complete endpoint metrics')).toBeTruthy();
	});

	it('makes sample origin and cancer headers sortable', async () => {
		const onSort = vi.fn();

		renderTable([createDataset()], { onSort });

		await fireEvent.click(screen.getByRole('button', { name: 'SAMPLE ORIGIN' }));
		await fireEvent.click(screen.getByRole('button', { name: 'CANCER' }));

		expect(onSort).toHaveBeenNthCalledWith(1, 'sampleOrigin');
		expect(onSort).toHaveBeenNthCalledWith(2, 'cancer');
	});
});
