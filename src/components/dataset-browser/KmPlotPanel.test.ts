import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KmPlotPanel from './KmPlotPanel.svelte';

describe('KmPlotPanel gene chooser focus management', () => {
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

	it('keeps the gene list open when focus moves from the input to a result button', async () => {
		vi.useFakeTimers();
		renderPanel();

		const input = screen.getByLabelText('Search genes');
		input.focus();

		const geneButton = await screen.findByRole('button', { name: /^TP53/ });
		input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: geneButton }));
		geneButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: input }));
		geneButton.focus();

		vi.advanceTimersByTime(151);

		expect(screen.getByRole('button', { name: /^TP53/ })).toBe(geneButton);
		expect(document.activeElement).toBe(geneButton);
	});

	it('closes the gene list after focus leaves the chooser', () => {
		vi.useFakeTimers();
		renderPanel();

		const input = screen.getByLabelText('Search genes');
		input.focus();

		const outsideButton = document.createElement('button');
		outsideButton.type = 'button';
		outsideButton.textContent = 'Outside';
		document.body.append(outsideButton);

		input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outsideButton }));
		outsideButton.focus();

		vi.advanceTimersByTime(151);

		expect(screen.queryByRole('button', { name: /^TP53/ })).toBeNull();
		outsideButton.remove();
	});
});
