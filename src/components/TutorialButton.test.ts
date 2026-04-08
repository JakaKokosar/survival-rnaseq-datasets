import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TutorialButton from './TutorialButton.svelte';

describe('TutorialButton', () => {
	const driveMock = vi.fn();
	const driverMock = vi.fn(() => ({ drive: driveMock }));

	afterEach(() => {
		cleanup();
		document.body.innerHTML = '';
		driverMock.mockClear();
		driveMock.mockClear();
	});

	async function flushAsyncWork(): Promise<void> {
		await Promise.resolve();
		await Promise.resolve();
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

		const config = driverMock.mock.calls[0][0];
		expect(config.showProgress).toBe(true);
		expect(config.steps).toHaveLength(2);
		expect(config.steps.map((step: { element: Element }) => step.element)).toEqual([table, detailHeader]);
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
});
