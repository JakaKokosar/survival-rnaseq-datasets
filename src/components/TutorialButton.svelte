<script lang="ts">
	import 'driver.js/dist/driver.css';
	import type { DriveStep } from 'driver.js';

	type DriverLoader = () => Promise<Pick<typeof import('driver.js'), 'driver'>>;

	type TutorialStepDefinition = {
		id: string;
		selector: string;
		popover: NonNullable<DriveStep['popover']>;
		enabled?: boolean;
	};

	interface Props {
		loadDriver?: DriverLoader;
	}

	const tutorialStepDefinitions: TutorialStepDefinition[] = [
		{
			id: 'tutorial-button',
			selector: '[data-tour="tutorial-button"]',
			popover: {
				title: 'Tutorial',
				description: 'Use this button any time to reopen a quick walkthrough of the interface.',
				side: 'bottom',
				align: 'end',
			},
			enabled: false,
		},
		{
			id: 'dataset-table',
			selector: '[data-tour="dataset-table"]',
			popover: {
				title: 'Dataset list',
				description: 'Browse datasets here, sort the table, and select a row to inspect it in more detail.',
				side: 'right',
			},
			enabled: true,
		},
		{
			id: 'dataset-details',
			selector: '[data-tour="dataset-details"]',
			popover: {
				title: 'Details panel',
				description: 'The right panel shows dataset details, summaries, widgets, and survival endpoint information.',
				side: 'left',
			},
			enabled: false,
		},
		{
			id: 'dataset-detail-header',
			selector: '[data-tour="dataset-detail-header"]',
			popover: {
				title: 'Dataset summary',
				description:
					'This section shows the selected dataset summary, key metadata, related publications, and download links.',
				side: 'left',
			},
			enabled: true,
		},
		{
			id: 'details-tab',
			selector: '[data-tour="details-tab"]',
			popover: {
				title: 'Details tab',
				description: 'On smaller screens, switch to the Details tab to inspect the selected dataset.',
				side: 'bottom',
			},
			enabled: false,
		},
	];

	let { loadDriver = () => import('driver.js') }: Props = $props();
	let showStartDialog = $state(false);
	let showPreview = $state(false);

	function isTourTargetVisible(element: Element | null): element is HTMLElement {
		if (!(element instanceof HTMLElement)) {
			return false;
		}

		if (element.hidden || element.closest('[hidden]')) {
			return false;
		}

		const style = window.getComputedStyle(element);
		if (style.display === 'none' || style.visibility === 'hidden') {
			return false;
		}

		return element.getClientRects().length > 0;
	}

	function buildTutorialSteps(): DriveStep[] {
		return tutorialStepDefinitions.flatMap((step) => {
			if (!step.enabled) {
				return [];
			}

			const element = document.querySelector(step.selector);
			if (!isTourTargetVisible(element)) {
				return [];
			}

			return [
				{
					element,
					popover: step.popover,
				},
			];
		});
	}

	function openTutorialDialog(): void {
		showStartDialog = true;
	}

	function closeTutorialDialog(): void {
		showStartDialog = false;
	}

	async function startTutorial(): Promise<void> {
		showStartDialog = false;
		const steps = buildTutorialSteps();
		if (steps.length === 0) {
			showPreview = true;
			return;
		}

		try {
			const { driver } = await loadDriver();
			showPreview = false;
			driver({
				showProgress: true,
				steps,
			}).drive();
		} catch (error) {
			console.error('Failed to start tutorial', error);
			showPreview = true;
		}
	}
</script>

<div class="relative">
	<button
		type="button"
		data-tour="tutorial-button"
		onclick={openTutorialDialog}
		class="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
	>
		Tutorial
	</button>

	{#if showStartDialog}
		<div class="fixed inset-0 z-40 bg-slate-900/45" aria-hidden="true"></div>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="tutorial-start-title"
			aria-describedby="tutorial-start-description"
			class="fixed inset-0 z-50 flex items-center justify-center p-4"
		>
			<div class="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
				<h2 id="tutorial-start-title" class="text-base font-semibold text-slate-900">Start Tutorial?</h2>
				<p id="tutorial-start-description" class="mt-2 text-sm leading-relaxed text-slate-600">
					This walkthrough will highlight the main parts of the dataset browser.
				</p>
				<p class="mt-4 text-sm text-slate-500">
					Do you want to continue with the tutorial?
				</p>
				<div class="mt-5 flex items-center justify-end gap-2">
					<button
						type="button"
						onclick={closeTutorialDialog}
						class="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={startTutorial}
						class="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
					>
						Start Tutorial
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if showPreview}
		<div class="fixed inset-0 z-40 bg-slate-900/45" aria-hidden="true"></div>
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="tutorial-preview-title"
				aria-describedby="tutorial-preview-description"
				class="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 text-left shadow-2xl"
			>
				<div class="flex items-start justify-between gap-3">
					<div>
						<p id="tutorial-preview-title" class="text-base font-semibold text-slate-900">Tutorial Preview</p>
						<p id="tutorial-preview-description" class="mt-1 text-sm text-slate-600">
							This is the style of popover the walkthrough should show while the page is dimmed behind it.
						</p>
					</div>
					<button
						type="button"
						onclick={() => (showPreview = false)}
						class="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
						aria-label="Close tutorial preview"
					>
						<svg aria-hidden="true" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"></path>
						</svg>
					</button>
				</div>

				<div class="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
					<p class="text-sm font-medium text-slate-900">Dataset list</p>
					<p class="mt-1 text-sm text-slate-600">
						Browse datasets here, sort the table, and select a row to inspect it in more detail.
					</p>
				</div>

				<div class="mt-4 flex items-center justify-between text-xs text-slate-500">
					<span>2 of 2</span>
					<div class="flex items-center gap-2">
						<button type="button" class="rounded border border-slate-300 px-2 py-1 text-slate-600">Previous</button>
						<button type="button" class="rounded border border-slate-300 px-2 py-1 text-slate-900">Done</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
