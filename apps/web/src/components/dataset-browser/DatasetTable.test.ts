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
	query: string;
	totalDatasetCount: number;
	onSort: (column: SortColumn) => void;
	onQueryChange: (query: string) => void;
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
			query: '',
			totalDatasetCount: sortedDatasets.length,
			onSort: vi.fn(),
			onQueryChange: vi.fn(),
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

		expect(screen.getByRole('columnheader', { name: 'Endpoint' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Missing' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Censored' })).toBeTruthy();
		expect(container.querySelector('[colspan]')).toBeNull();
		expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual([
			'N',
			'CANCER',
			'Endpoint',
			'Missing',
			'Censored',
		]);

		const statsRows = container.querySelectorAll('[data-dataset-id="GSE123"]');
		expect(statsRows).toHaveLength(2);
		expect(within(statsRows[0] as HTMLElement).getByText('OS')).toBeTruthy();
		expect(within(statsRows[0] as HTMLElement).getByText('48%')).toBeTruthy();
		expect(within(statsRows[0] as HTMLElement).getByText('5%')).toBeTruthy();
		expect(within(statsRows[1] as HTMLElement).getByText('DOR')).toBeTruthy();
		expect(within(statsRows[1] as HTMLElement).getAllByText('—').length).toBe(2);

		const emptyRow = container.querySelector('[data-dataset-id="GSE456"]');
		expect(emptyRow).not.toBeNull();
		expect(within(emptyRow as HTMLElement).getByLabelText('No complete endpoints')).toBeTruthy();
		expect(within(emptyRow as HTMLElement).getByText('No complete metrics')).toBeTruthy();
		expect(within(emptyRow as HTMLElement).getAllByText('—')).toHaveLength(2);
	});

	it('shows number-of-samples tooltip on N header and sample count cells', () => {
		renderTable([createDataset()]);

		expect(screen.getByRole('button', { name: 'N' }).getAttribute('title')).toBe('Number of samples');
		expect(screen.getByTitle('100 samples')).toBeTruthy();
	});

	it('makes cancer header sortable', async () => {
		const onSort = vi.fn();

		renderTable([createDataset()], { onSort });

		await fireEvent.click(screen.getByRole('button', { name: 'CANCER' }));

		expect(onSort).toHaveBeenCalledWith('cancer');
	});

	it('reports search input changes, including native search clearing', async () => {
		const onQueryChange = vi.fn();

		renderTable([createDataset()], {
			query: 'bre',
			totalDatasetCount: 3,
			onQueryChange,
		});

		const searchInput = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search datasets' });
		expect(searchInput.value).toBe('bre');
		expect(screen.getByText('1 of 3 datasets')).toBeTruthy();

		await fireEvent.input(searchInput, { target: { value: 'breast' } });
		expect(onQueryChange).toHaveBeenCalledWith('breast');

		await fireEvent.input(searchInput, { target: { value: '' } });
		expect(onQueryChange).toHaveBeenCalledWith('');
		expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
	});

	it('shows a useful empty search state', () => {
		renderTable([], { query: 'not-present', totalDatasetCount: 3 });

		expect(screen.getByText('No datasets match “not-present”')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy();
	});

	it('highlights matching text already visible in the table', () => {
		const { container } = renderTable([createDataset()], { query: 'gse' });

		expect(
			Array.from(container.querySelectorAll('[data-search-highlight]')).map((mark) => mark.textContent),
		).toEqual(['GSE']);
	});
});
