import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config, DriveStep } from 'driver.js';

import TutorialButton from './TutorialButton.svelte';

type TutorialConfig = Omit<Config, 'steps'> & {
	steps: Array<
		DriveStep & {
			element: NonNullable<DriveStep['element']>;
			popover: NonNullable<DriveStep['popover']>;
		}
	>;
};

describe('TutorialButton', () => {
	const driveMock = vi.fn();
	const driverMock = vi.fn((_config?: Config) => ({ drive: driveMock }));
	const localStorageMock = (() => {
		let store = new Map<string, string>();
		return {
			getItem: vi.fn((key: string) => store.get(key) ?? null),
			setItem: vi.fn((key: string, value: string) => {
				store.set(key, value);
			}),
			clear: vi.fn(() => {
				store = new Map<string, string>();
			}),
		};
	})();

	Object.defineProperty(window, 'localStorage', {
		value: localStorageMock,
		configurable: true,
	});

	beforeEach(() => {
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			callback(0);
			return 0;
		});
	});

	afterEach(() => {
		cleanup();
		document.body.innerHTML = '';
		localStorageMock.clear();
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();
		driverMock.mockClear();
		driveMock.mockClear();
		vi.restoreAllMocks();
	});

	async function flushAsyncWork(): Promise<void> {
		await Promise.resolve();
		await Promise.resolve();
	}

	function getTutorialConfig(): TutorialConfig {
		const config = driverMock.mock.calls.at(-1)?.[0];
		if (!config?.steps) {
			throw new Error('Expected the tutorial driver to receive steps');
		}
		return config as TutorialConfig;
	}

	function markVisible(element: Element): void {
		Object.defineProperty(element, 'getClientRects', {
			value: () => [{ width: 100, height: 40 }],
			configurable: true,
		});
	}

	function appendTourTarget(name: string, options: { hidden?: boolean } = {}): HTMLElement {
		const element = document.createElement('div');
		element.setAttribute('data-tour', name);
		if (options.hidden) {
			element.style.display = 'none';
			element.hidden = true;
			Object.defineProperty(element, 'getClientRects', {
				value: () => [],
				configurable: true,
			});
		} else {
			markVisible(element);
		}
		document.body.appendChild(element);
		return element;
	}

	it('starts the same complete tutorial regardless of the currently visible analysis tab', async () => {
		appendTourTarget('dataset-table');
		appendTourTarget('sample-data-viewer');

		render(TutorialButton, {
			props: {
				loadDriver: async () => ({ driver: driverMock }),
			},
		});

		const button = screen.getByRole('button', { name: 'Tutorial' });
		markVisible(button);

		await fireEvent.click(button);
		await fireEvent.click(screen.getByRole('button', { name: 'Start Tutorial' }));
		await flushAsyncWork();

		expect(driverMock).toHaveBeenCalledTimes(1);
		expect(driveMock).toHaveBeenCalledTimes(1);

		const config = getTutorialConfig();
		expect(config.showProgress).toBe(true);
		expect(config.steps).toHaveLength(9);
		expect(config.steps.map((step) => step.element)).toEqual([
			'[data-tour="dataset-table"]',
			'[data-tour="dataset-detail-header"]',
			'[data-tour="km-analysis"]',
			'[data-tour="km-survival-endpoints"]',
			'[data-tour="km-grouping-variable"]',
			'[data-tour="km-plot"]',
			'[data-tour="sample-data-viewer"]',
			'[data-tour="survival-endpoints"]',
			'[data-tour="prepared-datasets"]',
		]);
	});

	it('includes Kaplan-Meier, sample data, and survival endpoint explanations', async () => {
		appendTourTarget('dataset-table');

		render(TutorialButton, {
			props: {
				loadDriver: async () => ({ driver: driverMock }),
			},
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Start Tutorial' }));
		await flushAsyncWork();

		const config = getTutorialConfig();
		expect(config.steps.map((step) => step.popover.title)).toEqual([
			'Dataset list',
			'Dataset summary',
			'Kaplan-Meier Analysis',
			'Survival Endpoint',
			'Grouping Variable',
			'Survival Curves',
			'Sample data viewer',
			'Detected survival endpoints',
			'Prepared Datasets',
		]);
		expect(config.steps[2].popover.description).toContain('supports exploratory survival analysis');
		expect(config.steps[3].popover.description).toContain('linked time and event variables');
		expect(config.steps[4].popover.description).toContain('Hallmark gene sets are 50 curated');
		expect(config.steps[4].popover.description).toContain(
			'Single-sample gene set enrichment analysis (ssGSEA)',
		);
		expect(config.steps[4].popover.description).toContain('divides samples at its median score');
		expect(config.steps[4].popover.description).toContain('Špendl et al. (2025)');
		expect(config.steps[4].popover.description).toContain(
			'https://www.sciencedirect.com/science/article/pii/S0933365725000843',
		);
		expect(config.steps[5].popover.description).toContain('compares the estimated survival trajectories');
		expect(config.steps[5].popover.description).not.toMatch(/will display|when the plot is implemented/i);
		expect(config.steps[6].popover.side).toBe('left');
		expect(config.steps[7].popover.description).toContain('Each card represents an endpoint');
		expect(config.steps[7].popover.description).toContain('time variable and unit');
		expect(config.steps[7].popover.side).toBe('left');
		expect(config.steps[8].popover.title).toBe('Prepared Datasets');
	});

	it('opens each analysis tab with its content step and restores Kaplan-Meier on completion', async () => {
		appendTourTarget('dataset-table');
		const kmTab = document.createElement('button');
		kmTab.setAttribute('data-tour', 'km-tab');
		document.body.appendChild(kmTab);
		const sampleDataTab = document.createElement('button');
		sampleDataTab.setAttribute('data-tour', 'sample-data-tab');
		document.body.appendChild(sampleDataTab);
		const endpointsTab = document.createElement('button');
		endpointsTab.setAttribute('data-tour', 'endpoints-tab');
		document.body.appendChild(endpointsTab);
		const kmClick = vi.spyOn(kmTab, 'click');
		const sampleDataClick = vi.spyOn(sampleDataTab, 'click');
		const endpointsClick = vi.spyOn(endpointsTab, 'click');

		render(TutorialButton, {
			props: {
				loadDriver: async () => ({ driver: driverMock }),
			},
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Start Tutorial' }));
		await flushAsyncWork();

		const config = getTutorialConfig();
		const moveTo = vi.fn();
		const destroy = vi.fn();
		config.onNextClick?.(undefined, config.steps[5], {
			config,
			state: {},
			driver: {
				getActiveIndex: () => 5,
				moveTo,
			} as never,
		});
		await flushAsyncWork();
		expect(sampleDataClick).toHaveBeenCalledTimes(1);
		expect(moveTo).toHaveBeenLastCalledWith(6);

		config.onNextClick?.(undefined, config.steps[6], {
			config,
			state: {},
			driver: {
				getActiveIndex: () => 6,
				moveTo,
			} as never,
		});
		await flushAsyncWork();
		expect(endpointsClick).toHaveBeenCalledTimes(1);
		expect(moveTo).toHaveBeenLastCalledWith(7);

		config.onNextClick?.(undefined, config.steps[8], {
			config,
			state: {},
			driver: {
				getActiveIndex: () => 8,
				destroy,
			} as never,
		});
		await flushAsyncWork();
		expect(kmClick).toHaveBeenCalledTimes(1);
		expect(destroy).toHaveBeenCalledTimes(1);
	});

	it('shows a preview card when starting the tutorial fails', async () => {
		appendTourTarget('dataset-table');
		appendTourTarget('dataset-details');
		const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
		driverMock.mockImplementationOnce(() => {
			throw new Error('driver failed');
		});

		render(TutorialButton, {
			props: {
				loadDriver: async () => ({ driver: driverMock }),
			},
		});

		const button = screen.getByRole('button', { name: 'Tutorial' });
		markVisible(button);

		await fireEvent.click(button);
		await fireEvent.click(screen.getByRole('button', { name: 'Start Tutorial' }));
		await flushAsyncWork();

		expect(screen.getByRole('dialog', { name: 'Tutorial Preview' })).toBeTruthy();
		expect(screen.getByText(/this is the style of popover the walkthrough should show/i)).toBeTruthy();

		consoleErrorMock.mockRestore();
	});

	it('shows a confirmation dialog before starting the tutorial', async () => {
		render(TutorialButton, {
			props: {
				loadDriver: async () => ({ driver: driverMock }),
			},
		});

		const button = screen.getByRole('button', { name: 'Tutorial' });
		markVisible(button);

		await fireEvent.click(button);

		expect(screen.getByRole('dialog', { name: 'Start Tutorial?' })).toBeTruthy();
		expect(
			screen.getByText('This walkthrough will highlight the main parts of the dataset browser.'),
		).toBeTruthy();
		expect(screen.queryByText(/reset all values/i)).toBeNull();
	});

	it('opens the tutorial dialog by default until dismissed permanently', async () => {
		render(TutorialButton, {
			props: {
				loadDriver: async () => ({ driver: driverMock }),
			},
		});

		expect(screen.getByRole('dialog', { name: 'Start Tutorial?' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Never Show Again' }));

		expect(screen.queryByRole('dialog', { name: 'Start Tutorial?' })).toBeNull();
		expect(localStorageMock.getItem('datasetBrowserTutorialNeverShow')).toBe('true');
	});

	it('does not auto-open the tutorial dialog after opting out', async () => {
		localStorageMock.setItem('datasetBrowserTutorialNeverShow', 'true');

		render(TutorialButton, {
			props: {
				loadDriver: async () => ({ driver: driverMock }),
			},
		});

		expect(screen.queryByRole('dialog', { name: 'Start Tutorial?' })).toBeNull();
	});
});
