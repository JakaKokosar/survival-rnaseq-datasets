import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KmPlotPanel from './KmPlotPanel.svelte';

describe('KmPlotPanel gene filtering and selection', () => {
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	function renderPanel() {
		const onSelectGene = vi.fn();

		render(KmPlotPanel, {
			props: {
				isOpen: true,
				kmWidgetIframeSrc: 'https://example.com/km-plot',
				candidateGenes: ['TP53', 'BRCA1'],
				selectedCandidateGene: null,
				onToggleOpen: vi.fn(),
				onSelectGene
			}
		});

		return { onSelectGene };
	}

	it('filters genes by symbol and description text', async () => {
		renderPanel();

		const input = screen.getByLabelText('Search genes');
		await fireEvent.input(input, { target: { value: 'tumor suppressor' } });

		expect(screen.getByRole('button', { name: /^TP53/ })).not.toBeNull();
		expect(screen.queryByRole('button', { name: /^BRCA1/ })).toBeNull();

		await fireEvent.input(input, { target: { value: 'BRCA' } });

		expect(screen.getByRole('button', { name: /^BRCA1/ })).not.toBeNull();
		expect(screen.queryByRole('button', { name: /^TP53/ })).toBeNull();
	});

	it('shows the empty-state message when no genes match the filter', async () => {
		renderPanel();

		const input = screen.getByLabelText('Search genes');
		await fireEvent.input(input, { target: { value: 'does-not-exist' } });

		expect(screen.getByText('No genes matching "does-not-exist"')).not.toBeNull();
		expect(screen.queryByRole('button', { name: /^TP53/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^BRCA1/ })).toBeNull();
	});

	it('calls onSelectGene with the clicked gene', async () => {
		const { onSelectGene } = renderPanel();

		await fireEvent.click(screen.getByRole('button', { name: /^TP53/ }));

		expect(onSelectGene).toHaveBeenCalledTimes(1);
		expect(onSelectGene).toHaveBeenCalledWith('TP53');
	});
});
