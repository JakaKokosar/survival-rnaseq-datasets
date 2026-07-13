import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config, DriveStep } from 'driver.js';

import TutorialButton from './TutorialButton.svelte';

type TutorialConfig = Omit<Config, 'steps'> & {
	steps: Array<
		DriveStep & {
			element: Element;
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

	afterEach(() => {
		cleanup();
		document.body.innerHTML = '';
		localStorageMock.clear();
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();
		driverMock.mockClear();
		driveMock.mockClear();
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

	it('starts a tour with only visible targets', async () => {
		const table = appendTourTarget('dataset-table');
		const detailHeader = appendTourTarget('dataset-detail-header');
		appendTourTarget('dataset-details');
		appendTourTarget('details-tab', { hidden: true });

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
		expect(config.steps).toHaveLength(2);
		expect(config.steps.map((step: { element: Element }) => step.element)).toEqual([table, detailHeader]);
	});

	it('includes the complete tutorial for the current Kaplan-Meier controls and chart', async () => {
		const kmAnalysis = appendTourTarget('km-analysis');
		const kmEndpoints = appendTourTarget('km-survival-endpoints');
		const kmGrouping = appendTourTarget('km-grouping-variable');
		const kmPlot = appendTourTarget('km-plot');

		render(TutorialButton, {
			props: {
				loadDriver: async () => ({ driver: driverMock }),
			},
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Start Tutorial' }));
		await flushAsyncWork();

		const config = getTutorialConfig();
		expect(config.steps.map((step: { element: Element }) => step.element)).toEqual([
			kmAnalysis,
			kmEndpoints,
			kmGrouping,
			kmPlot,
		]);
		expect(config.steps.map((step) => step.popover.title)).toEqual([
			'Kaplan-Meier Analysis',
			'Survival Endpoint',
			'Grouping Variable',
			'Survival Curves',
		]);
		expect(config.steps[0].popover.description).toContain('supports exploratory survival analysis');
		expect(config.steps[1].popover.description).toContain('linked time and event variables');
		expect(config.steps[2].popover.description).toContain('Hallmark pathway score');
		expect(config.steps[2].popover.description).toContain('divided at the median');
		expect(config.steps[3].popover.description).toContain('compares the estimated survival trajectories');
		expect(config.steps[3].popover.description).not.toMatch(/will display|when the plot is implemented/i);
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
