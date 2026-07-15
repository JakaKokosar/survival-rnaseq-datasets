import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SampleDataPanel from './SampleDataPanel.svelte';
import type { Component } from 'svelte';
import type { Dataset } from '../../types/dataset';

interface SampleDataPanelProps {
	dataset: Dataset | null;
}

function createDataset(overrides: Partial<Dataset> = {}): Dataset {
	return {
		data_id: 'GSE123',
		data_url: 'https://example.com/dataset',
		pmcids: [],
		related_publications: [],
		'survival-endpoints': [],
		data_file_names: ['GSE123_primary.csv'],
		data_summary: {
			samples: 2,
			clinical_features: 2,
			genes: 50,
		},
		'Experiment type': 'Expression profiling by high throughput sequencing',
		Reproducible: 'YES',
		'NCBI-generated data': 'Available',
		...overrides,
	};
}

function renderPanel(overrides: Partial<SampleDataPanelProps> = {}) {
	return render(SampleDataPanel as unknown as Component<SampleDataPanelProps>, {
		props: {
			dataset: createDataset(),
			...overrides,
		},
	});
}

const originalFetch = globalThis.fetch;

describe('SampleDataPanel', () => {
	afterEach(() => {
		cleanup();
		globalThis.fetch = originalFetch;
	});

	it('loads and renders a scrollable sample table', async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response('sample_id,age,note\nS1,42,"quoted, note"\nS2,,plain\n', {
					status: 200,
				}),
		) as unknown as typeof fetch;

		const { container } = renderPanel();

		expect(screen.getByTestId('sample-data-loading')).toBeTruthy();

		await waitFor(() => {
			expect(screen.getByText('2 rows x 3 columns')).toBeTruthy();
		});

		const table = screen.getByRole('table');
		expect(within(table).getByRole('columnheader', { name: 'sample_id' })).toBeTruthy();
		expect(within(table).getByRole('columnheader', { name: 'age' })).toBeTruthy();
		expect(within(table).getByText('quoted, note')).toBeTruthy();
		expect(within(table).getByText('plain')).toBeTruthy();
		expect(container.querySelector('.overflow-y-scroll')).not.toBeNull();
		expect(globalThis.fetch).toHaveBeenCalledOnce();
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'/downloads/GSE123_preprocessed_ssgsea.csv',
			expect.any(Object),
		);
	});

	it('sorts sample rows by column header', async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response('sample_id,age\nS2,42\nS1,31\nS3,55\n', {
					status: 200,
				}),
		) as unknown as typeof fetch;

		renderPanel();

		await waitFor(() => {
			expect(screen.getByText('3 rows x 2 columns')).toBeTruthy();
		});

		const table = screen.getByRole('table');
		await fireEvent.click(within(table).getByRole('button', { name: 'age' }));

		await waitFor(() => {
			const ageHeader = within(table)
				.getAllByRole('columnheader')
				.find((header) => header.textContent?.includes('age'));
			expect(ageHeader?.getAttribute('aria-sort')).toBe('ascending');
		});

		const rowTexts = within(table)
			.getAllByRole('row')
			.slice(1)
			.map((row) => row.textContent);

		expect(rowTexts[0]).toContain('S1');
		expect(rowTexts[1]).toContain('S2');
		expect(rowTexts[2]).toContain('S3');
	});

	it('rounds numeric cells only when they have more than two decimal places', async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response('sample_id,score,count\nS1,42.345,7\nS2,-1.235,3.5\nS3,,\n', {
					status: 200,
				}),
		) as unknown as typeof fetch;

		renderPanel();

		await waitFor(() => {
			expect(screen.getByText('42.35')).toBeTruthy();
		});

		expect(screen.getByText('7')).toBeTruthy();
		expect(screen.getByText('3.5')).toBeTruthy();
		expect(screen.getByText('-1.24')).toBeTruthy();
		expect(screen.getByText('S1')).toBeTruthy();
	});

	it('aligns missing-value indicators with the numeric column', async () => {
		globalThis.fetch = vi.fn(
			async () => new Response('sample_id,score\nS1,42\nS2,\n', { status: 200 }),
		) as unknown as typeof fetch;

		renderPanel();

		await waitFor(() => {
			expect(screen.getByText('42')).toBeTruthy();
		});

		const missingCell = screen.getByText('—').closest('td');
		expect(missingCell?.classList.contains('text-right')).toBe(true);
	});

	it('keeps numeric-looking labels aligned with text in mixed columns', async () => {
		globalThis.fetch = vi.fn(
			async () => new Response('sample_id,stage\nS1,IA\nS2,1\nS3,IB\n', { status: 200 }),
		) as unknown as typeof fetch;

		renderPanel();

		await waitFor(() => {
			expect(screen.getByText('IA')).toBeTruthy();
		});

		expect(screen.getByText('IA').closest('td')?.classList.contains('text-right')).toBe(false);
		expect(screen.getByText('1').closest('td')?.classList.contains('text-right')).toBe(false);
		expect(screen.getByText('IB').closest('td')?.classList.contains('text-right')).toBe(false);
	});

	it('subtly highlights survival feature data cells without highlighting headers', async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response('sample_id,days_to_event,event_status\nS1,10,1\n', { status: 200 }),
		) as unknown as typeof fetch;

		renderPanel({
			dataset: createDataset({
				'survival-endpoints': [
					{
						abbrv: 'OS',
						time_var: { var_name: 'days_to_event', var_unit: 'days' },
						event_var: {
							var_name: 'event_status',
							var_values: ['0', '1'],
							var_meaning: '1 = event, 0 = censored',
						},
						notes: [],
					},
				],
			}),
		});

		await waitFor(() => {
			expect(screen.getByText('10')).toBeTruthy();
		});

		const table = screen.getByRole('table');
		expect(
			within(table).getByRole('columnheader', { name: 'days_to_event' }).classList.contains('bg-slate-100/70'),
		).toBe(false);
		expect(screen.getByText('10').closest('td')?.classList.contains('bg-slate-100/70')).toBe(true);
		expect(screen.getByText('1').closest('td')?.classList.contains('bg-slate-100/70')).toBe(true);
		expect(screen.getByText('S1').closest('td')?.classList.contains('bg-slate-100/70')).toBe(false);
	});

	it('ignores downloadable dataset filenames and loads only the sample-viewer artifact', async () => {
		globalThis.fetch = vi.fn(
			async () => new Response('sample_id,value\nS1,1\n', { status: 200 }),
		) as unknown as typeof fetch;

		renderPanel();

		await waitFor(() => {
			expect(screen.getByText('1 rows x 2 columns')).toBeTruthy();
		});

		expect(screen.queryByText('GSE123_preprocessed_ssgsea.csv')).toBeNull();
		expect(globalThis.fetch).toHaveBeenCalledOnce();
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'/downloads/GSE123_preprocessed_ssgsea.csv',
			expect.any(Object),
		);
	});

	it('renders an empty state for a blank CSV', async () => {
		globalThis.fetch = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch;

		renderPanel();

		await waitFor(() => {
			expect(screen.getByText('No sample rows available.')).toBeTruthy();
		});
	});

	it('loads large tables without the old preview cap', async () => {
		const rows = Array.from({ length: 105 }, (_unused, index) => `S${index + 1},${index + 1}`);
		globalThis.fetch = vi.fn(
			async () => new Response(`sample_id,value\n${rows.join('\n')}\n`, { status: 200 }),
		) as unknown as typeof fetch;

		renderPanel({
			dataset: createDataset({
				data_summary: {
					samples: 105,
					clinical_features: 2,
					genes: 50,
				},
			}),
		});

		await waitFor(() => {
			expect(screen.getByText('105 rows x 2 columns')).toBeTruthy();
		});

		expect(screen.queryByRole('button', { name: 'Load full table' })).toBeNull();
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});

	it('renders a fetch error state', async () => {
		globalThis.fetch = vi.fn(async () => new Response('Not found', { status: 404 })) as unknown as typeof fetch;

		renderPanel({
			dataset: createDataset({
				data_file_names: [],
			}),
		});

		await waitFor(() => {
			expect(screen.getByText('Sample data unavailable')).toBeTruthy();
			expect(screen.getByText('HTTP 404')).toBeTruthy();
		});

		expect(globalThis.fetch).toHaveBeenCalledOnce();
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'/downloads/GSE123_preprocessed_ssgsea.csv',
			expect.any(Object),
		);
	});

	it('aborts stale fetches when the selected dataset changes', async () => {
		const firstFetch = {
			signal: null as AbortSignal | null,
		};
		globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).includes('GSE123')) {
				firstFetch.signal = init?.signal ?? null;
				return new Promise<Response>(() => {});
			}
			return Promise.resolve(new Response('sample_id,value\nS2,2\n', { status: 200 }));
		}) as unknown as typeof fetch;

		const { rerender } = renderPanel();
		await waitFor(() => {
			expect(firstFetch.signal).not.toBeNull();
		});

		await rerender({
			dataset: createDataset({
				data_id: 'GSE456',
				data_file_names: ['GSE456_primary.csv'],
			}),
		});

		expect(firstFetch.signal?.aborted).toBe(true);
		await waitFor(() => {
			expect(screen.getByText('1 rows x 2 columns')).toBeTruthy();
		});
	});

	it('reuses cached parsed data after switching away from and back to a dataset', async () => {
		globalThis.fetch = vi.fn(
			async () => new Response('sample_id,value\nS1,1\n', { status: 200 }),
		) as unknown as typeof fetch;

		const dataset = createDataset();
		const { rerender } = renderPanel({ dataset });

		await waitFor(() => {
			expect(screen.getByText('1 rows x 2 columns')).toBeTruthy();
		});

		await rerender({
			dataset: createDataset({
				data_id: 'GSE456',
				data_file_names: ['GSE456_primary.csv'],
			}),
		});
		await rerender({ dataset });

		expect(globalThis.fetch).toHaveBeenCalledTimes(2);
		expect(screen.getByText('1 rows x 2 columns')).toBeTruthy();
	});
});
