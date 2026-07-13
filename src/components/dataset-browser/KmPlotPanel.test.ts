import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KmPlotPanel from './KmPlotPanel.svelte';
import type { SurvivalEndpoint } from '../../types/dataset';

const TEST_ENDPOINTS: SurvivalEndpoint[] = [
	{
		abbrv: 'OS',
		time_var: { var_name: 'os.time', var_unit: 'months' },
		event_var: { var_name: 'os.event', var_values: ['0', '1'], var_meaning: 'death' },
		notes: [],
	},
	{
		abbrv: 'PFS',
		time_var: { var_name: 'pfs.time', var_unit: 'months' },
		event_var: { var_name: 'pfs.event', var_values: ['0', '1'], var_meaning: 'progression' },
		notes: [],
	},
];

type StubResult = {
	series: Array<{
		key: string;
		label: string;
		color: string;
		total: number;
		events: number;
		median: number | null;
		points: Array<{
			time: number;
			survival: number;
			atRisk: number;
			events: number;
			censors: number;
			ciLow: number;
			ciHigh: number;
		}>;
		censorTicks: Array<{ time: number; survival: number }>;
	}>;
	numericColumns: string[];
};

function stubResult(label: string): StubResult {
	return {
		series: [
			{
				key: label,
				label,
				color: '#18aeea',
				total: 25,
				events: 17,
				median: 22.8,
				points: [
					{ time: 0, survival: 1, atRisk: 25, events: 0, censors: 0, ciLow: 1, ciHigh: 1 },
					{ time: 10, survival: 0.6, atRisk: 25, events: 10, censors: 0, ciLow: 0.4, ciHigh: 0.78 },
				],
				censorTicks: [
					{ time: 5, survival: 0.9 },
					{ time: 5, survival: 0.9 },
				],
			},
		],
		numericColumns: ['HALLMARK_HYPOXIA', 'Study_ID'],
	};
}

function renderPanel(datasetId: string | null = 'GSE224564', endpoints: SurvivalEndpoint[] = TEST_ENDPOINTS) {
	return render(KmPlotPanel, {
		props: {
			isOpen: true,
			onToggleOpen: vi.fn(),
			datasetId,
			endpoints,
		},
	});
}

const originalFetch = globalThis.fetch;

describe('KmPlotPanel', () => {
	beforeEach(() => {
		globalThis.fetch = vi.fn(async () => new Response('time,event\n1,1\n', { status: 200 })) as unknown as typeof fetch;
		window.kmPythonCompute = vi.fn((_csv: string, _timeCol: string, _eventCol: string, groupCol: string | null) => {
			const label = groupCol ? `${groupCol} group` : 'All patients';
			return JSON.stringify(stubResult(label));
		});
		window.kmPythonReady = true;
		window.dispatchEvent(new Event('kmpython:ready'));
	});

	afterEach(() => {
		cleanup();
		delete window.kmPythonCompute;
		window.kmPythonReady = false;
		globalThis.fetch = originalFetch;
	});

	it('renders the local Kaplan-Meier panel content', async () => {
		const { container } = renderPanel();
		await waitFor(() => {
			expect(container.querySelector('[data-testid="km-py-loading"]')).toBeNull();
		});
		const content = container.querySelector('#km-plot-panel-content');
		expect(content).not.toBeNull();
		expect(within(content as HTMLElement).getByRole('img', { name: /Kaplan-Meier OS survival chart/ })).not.toBeNull();

		const endpointTarget = container.querySelector('[data-tour="km-survival-endpoints"]');
		const groupingTarget = container.querySelector('[data-tour="km-grouping-variable"]');
		const plotTarget = container.querySelector('[data-tour="km-plot"]');
		expect(endpointTarget).not.toBeNull();
		expect(within(endpointTarget as HTMLElement).getByLabelText('Survival endpoint')).not.toBeNull();
		expect(within(endpointTarget as HTMLElement).getByLabelText('Event endpoint')).not.toBeNull();
		expect(groupingTarget).not.toBeNull();
		expect(within(groupingTarget as HTMLElement).getByLabelText('Group by')).not.toBeNull();
		expect(plotTarget).not.toBeNull();
		expect(within(plotTarget as HTMLElement).getByRole('img', { name: /Kaplan-Meier OS survival chart/ })).not.toBeNull();
	});

	it('renders legend rows with group labels and stats', async () => {
		window.kmPythonCompute = vi.fn(() =>
			JSON.stringify({
				series: [
					{
						key: '< 1',
						label: '< 1',
						color: '#18aeea',
						total: 40,
						events: 35,
						median: 39,
						points: [
							{ time: 0, survival: 1, atRisk: 40, events: 0, censors: 0, ciLow: 1, ciHigh: 1 },
						],
						censorTicks: [],
					},
					{
						key: '>= 1',
						label: '>= 1',
						color: '#ff4d24',
						total: 40,
						events: 25,
						median: 69.6,
						points: [
							{ time: 0, survival: 1, atRisk: 40, events: 0, censors: 0, ciLow: 1, ciHigh: 1 },
						],
						censorTicks: [],
					},
				],
				numericColumns: ['HALLMARK_HYPOXIA', 'Study_ID'],
			}),
		);

		const { container } = renderPanel();
		await waitFor(() => {
			expect(container.querySelector('[data-testid="km-py-loading"]')).toBeNull();
		});

		await waitFor(() => {
			const legend = container.querySelector('[data-testid="km-legend"]');
			expect(legend).not.toBeNull();
			expect(legend?.querySelectorAll('[data-testid="km-legend-row"]').length).toBe(2);
		});

		const legend = container.querySelector('[data-testid="km-legend"]');
		expect(legend?.textContent).toContain('< 1');
		expect(legend?.textContent).toContain('35/40');
		expect(legend?.textContent).toContain('>= 1');
		expect(legend?.textContent).toContain('25/40');
	});

	it('hides and shows confidence intervals, median survival, and censoring ticks', async () => {
		const { container } = renderPanel();
		await waitFor(() => {
			expect(container.querySelector('[data-testid="km-py-loading"]')).toBeNull();
		});

		expect(screen.getByTestId('km-confidence-layer')).not.toBeNull();
		expect(screen.getByTestId('km-median-layer')).not.toBeNull();
		expect(screen.getByTestId('km-censor-layer')).not.toBeNull();

		await fireEvent.click(screen.getByLabelText('Show confidence intervals'));
		await fireEvent.click(screen.getByLabelText('Show median survival'));
		await fireEvent.click(screen.getByLabelText('Show censoring ticks'));

		expect(container.querySelector('[data-testid="km-confidence-layer"]')).toBeNull();
		expect(container.querySelector('[data-testid="km-median-layer"]')).toBeNull();
		expect(container.querySelector('[data-testid="km-censor-layer"]')).toBeNull();

		await fireEvent.click(screen.getByLabelText('Show confidence intervals'));
		await fireEvent.click(screen.getByLabelText('Show median survival'));
		await fireEvent.click(screen.getByLabelText('Show censoring ticks'));

		expect(screen.getByTestId('km-confidence-layer')).not.toBeNull();
		expect(screen.getByTestId('km-median-layer')).not.toBeNull();
		expect(screen.getByTestId('km-censor-layer')).not.toBeNull();
	});

	it('updates the chart when selecting PFS', async () => {
		const { container } = renderPanel();
		await waitFor(() => {
			expect(container.querySelector('[data-testid="km-py-loading"]')).toBeNull();
		});

		await fireEvent.change(screen.getByLabelText('Survival endpoint'), { target: { value: '1' } });

		expect(screen.getByRole('img', { name: /Kaplan-Meier PFS survival chart/ })).not.toBeNull();
		await waitFor(() => {
			const calls = (window.kmPythonCompute as unknown as { mock: { calls: unknown[][] } }).mock.calls;
			expect(calls.some((args) => args[1] === 'pfs.time' && args[2] === 'pfs.event')).toBe(true);
		});
	});

	it('clears stale grouped results and resets grouping while a new dataset loads', async () => {
		const nextFetch = {
			resolve: null as ((response: Response) => void) | null,
		};
		globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('GSE224564')) {
				return Promise.resolve(new Response('first dataset', { status: 200 }));
			}
			if (url.includes('GSE96058')) {
				return new Promise<Response>((resolve) => {
					nextFetch.resolve = resolve;
				});
			}
			return Promise.resolve(new Response('', { status: 404 }));
		}) as unknown as typeof fetch;
		window.kmPythonCompute = vi.fn((csv: string, _timeCol: string, _eventCol: string, groupCol: string | null) => {
			const datasetLabel = csv.includes('second') ? 'Second dataset' : 'First dataset';
			const label = groupCol ? `${datasetLabel} ${groupCol} group` : `${datasetLabel} all`;
			return JSON.stringify(stubResult(label));
		});

		const { container, rerender } = renderPanel('GSE224564');

		await waitFor(() => {
			expect(container.querySelector('[data-testid="km-legend"]')?.textContent).toContain('First dataset all');
		});

		await fireEvent.change(screen.getByLabelText('Group by'), {
			target: { value: 'HALLMARK_HYPOXIA' },
		});
		await waitFor(() => {
			expect(container.querySelector('[data-testid="km-legend"]')?.textContent).toContain(
				'First dataset HALLMARK_HYPOXIA group',
			);
		});

		await rerender({
			isOpen: true,
			onToggleOpen: vi.fn(),
			datasetId: 'GSE96058',
			endpoints: TEST_ENDPOINTS,
		});

		await waitFor(() => {
			expect(screen.getByLabelText('Group by')).toHaveProperty('value', '(None)');
			expect(container.querySelector('[data-testid="km-legend-row"]')).toBeNull();
			expect(screen.getByTestId('km-legend-empty')).not.toBeNull();
		});

		const resolveFetch = nextFetch.resolve;
		if (!resolveFetch) throw new Error('Expected pending dataset fetch');
		resolveFetch(new Response('second dataset', { status: 200 }));

		await waitFor(() => {
			expect(container.querySelector('[data-testid="km-legend"]')?.textContent).toContain('Second dataset all');
		});
		expect(window.kmPythonCompute).toHaveBeenLastCalledWith('second dataset', 'os.time', 'os.event', null);
	});

	it('changing the event select also switches the linked time variable', async () => {
		const { container } = renderPanel();
		await waitFor(() => {
			expect(container.querySelector('[data-testid="km-py-loading"]')).toBeNull();
		});

		await fireEvent.change(screen.getByLabelText('Event endpoint'), { target: { value: '1' } });

		const timeSelect = screen.getByLabelText('Survival endpoint') as HTMLSelectElement;
		expect(timeSelect.value).toBe('1');
		expect(screen.getByRole('img', { name: /Kaplan-Meier PFS survival chart/ })).not.toBeNull();
	});

	it('shows a loading state until the Python runtime is ready', async () => {
		window.kmPythonReady = false;
		delete window.kmPythonCompute;
		const { container } = renderPanel();
		expect(container.querySelector('[data-testid="km-py-loading"]')).not.toBeNull();

		window.kmPythonCompute = vi.fn(() => JSON.stringify(stubResult('All patients')));
		window.kmPythonReady = true;
		window.dispatchEvent(new Event('kmpython:ready'));

		await waitFor(() => {
			expect(container.querySelector('[data-testid="km-py-loading"]')).toBeNull();
		});
	});
});
