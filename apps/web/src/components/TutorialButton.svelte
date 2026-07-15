<script lang="ts">
	import { onMount } from 'svelte';
	import { driver as createDriver, type DriveStep, type Driver } from 'driver.js';
	import 'driver.js/dist/driver.css';
	import { SPENDL_ET_AL_CITATION, SPENDL_ET_AL_PAPER_URL } from '../lib/hallmarkAnalysis';

	type DriverLoader = () => Promise<Pick<typeof import('driver.js'), 'driver'>>;

	type TutorialStepDefinition = {
		id: string;
		selector: string;
		popover: NonNullable<DriveStep['popover']>;
		view: 'list' | 'details';
		section?: 'km' | 'sample-data' | 'endpoints';
	};

	interface Props {
		loadDriver?: DriverLoader;
	}

	const TUTORIAL_NEVER_SHOW_KEY = 'datasetBrowserTutorialNeverShow';

	function getTutorialStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
		const storage = window.localStorage;
		if (
			storage &&
			typeof storage.getItem === 'function' &&
			typeof storage.setItem === 'function'
		) {
			return storage;
		}
		return null;
	}

	const tutorialStepDefinitions: TutorialStepDefinition[] = [
		{
			id: 'dataset-table',
			selector: '[data-tour="dataset-table"]',
			view: 'list',
			popover: {
				title: 'Dataset list',
				description: 'Browse datasets here in the list view and select a row to inspect it in more detail.',
				side: 'right',
			},
		},
		{
			id: 'dataset-detail-header',
			selector: '[data-tour="dataset-detail-header"]',
			view: 'details',
			section: 'km',
			popover: {
				title: 'Dataset summary',
				description:
					'This section shows the selected dataset summary, key metadata, related publications, and download links.',
				side: 'left',
			},
		},
		{
			id: 'km-analysis',
			selector: '[data-tour="km-analysis"]',
			view: 'details',
			section: 'km',
			popover: {
				title: 'Kaplan-Meier Analysis',
				description:
					'This panel supports exploratory survival analysis for the selected GSE dataset. Use it to examine how endpoint choice and Hallmark pathway stratification affect the estimated survival curves.',
				side: 'left',
			},
		},
		{
			id: 'km-survival-endpoints',
			selector: '[data-tour="km-survival-endpoints"]',
			view: 'details',
			section: 'km',
			popover: {
				title: 'Survival Endpoint',
				description:
					'Choose the clinical endpoint used as the time-to-event outcome. The linked time and event variables come from endpoint definitions detected in the dataset metadata.',
				side: 'right',
			},
		},
		{
			id: 'km-grouping-variable',
			selector: '[data-tour="km-grouping-variable"]',
			view: 'details',
			section: 'km',
			popover: {
				title: 'Grouping Variable',
				description: `Hallmark gene sets are 50 curated, minimally redundant collections representing well-defined biological processes and states. Single-sample gene set enrichment analysis (ssGSEA) summarizes the expression of each set as one enrichment score per sample. Hallmarks are ranked by survival differences, and selecting one divides samples at its median score to compare survival curves. See <a class="tutorial-citation-link" href="${SPENDL_ET_AL_PAPER_URL}" target="_blank" rel="noopener noreferrer">${SPENDL_ET_AL_CITATION}</a> for the original method.`,
				side: 'right',
			},
		},
		{
			id: 'km-plot',
			selector: '[data-tour="km-plot"]',
			view: 'details',
			section: 'km',
			popover: {
				title: 'Survival Curves',
				description:
					'This chart compares the estimated survival trajectories for the selected endpoint and grouping. Separation between curves can suggest an association between the pathway score and outcome.',
				side: 'left',
			},
		},
		{
			id: 'sample-data-viewer',
			selector: '[data-tour="sample-data-viewer"]',
			view: 'details',
			section: 'sample-data',
			popover: {
				title: 'Sample data viewer',
				description:
					'This viewer shows the sample-level table behind the selected dataset so you can inspect rows, variables, and the data used in the analysis widgets.',
				side: 'left',
			},
		},
		{
			id: 'survival-endpoints',
			selector: '[data-tour="survival-endpoints"]',
			view: 'details',
			section: 'endpoints',
			popover: {
				title: 'Detected survival endpoints',
				description:
					'Each card represents an endpoint found during dataset curation, such as overall, progression-free, or disease-free survival. It documents the time variable and unit, event variable and coding, and any curation notes. Incomplete definitions are marked so you can judge whether an endpoint is ready for analysis.',
				side: 'left',
			},
		},
		{
			id: 'prepared-datasets',
			selector: '[data-tour="prepared-datasets"]',
			view: 'details',
			popover: {
				title: 'Prepared Datasets',
				description:
					'If you want to continue the analysis outside the browser, use these prepared dataset files.',
				side: 'left',
			},
		},
	];

	let { loadDriver = async () => ({ driver: createDriver }) }: Props = $props();
	let showStartDialog = $state(false);
	let showPreview = $state(false);

	onMount(() => {
		const storage = getTutorialStorage();
		if (storage?.getItem(TUTORIAL_NEVER_SHOW_KEY) !== 'true') {
			showStartDialog = true;
		}
	});

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
		return tutorialStepDefinitions.map((step) => ({
			element: step.selector,
			popover: step.popover,
		}));
	}

	function clickVisibleTourTarget(selector: string): void {
		const target = document.querySelector(selector);
		if (isTourTargetVisible(target) && target instanceof HTMLButtonElement) {
			target.click();
		}
	}

	function waitForTutorialView(): Promise<void> {
		return new Promise((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
		});
	}

	async function prepareTutorialStep(stepIndex: number): Promise<void> {
		const step = tutorialStepDefinitions[stepIndex];
		if (!step) return;

		clickVisibleTourTarget(`[data-tour="${step.view}-tab"]`);
		if (step.section) {
			const sectionTab = document.querySelector(`[data-tour="${step.section}-tab"]`);
			if (sectionTab instanceof HTMLButtonElement) sectionTab.click();
		}

		await waitForTutorialView();
	}

	function moveTutorial(driver: Driver, direction: 1 | -1): void {
		const activeIndex = driver.getActiveIndex();
		if (activeIndex === undefined) return;

		const targetIndex = activeIndex + direction;
		if (targetIndex < 0) return;
		if (targetIndex >= tutorialStepDefinitions.length) {
			const kmTab = document.querySelector('[data-tour="km-tab"]');
			if (kmTab instanceof HTMLButtonElement) kmTab.click();
			void waitForTutorialView().then(() => driver.destroy());
			return;
		}

		void prepareTutorialStep(targetIndex).then(() => driver.moveTo(targetIndex));
	}

	function openTutorialDialog(): void {
		showStartDialog = true;
	}

	function closeTutorialDialog(): void {
		showStartDialog = false;
	}

	function neverShowTutorialAgain(): void {
		getTutorialStorage()?.setItem(TUTORIAL_NEVER_SHOW_KEY, 'true');
		showStartDialog = false;
	}

	async function startTutorial(): Promise<void> {
		showStartDialog = false;
		const steps = buildTutorialSteps();
		if (!document.querySelector(tutorialStepDefinitions[0].selector)) {
			showPreview = true;
			return;
		}

		try {
			await prepareTutorialStep(0);
			const { driver } = await loadDriver();
			showPreview = false;
			const tutorialDriver = driver({
				showProgress: true,
				steps,
				onNextClick: (_element, _step, { driver: activeDriver }) => {
					moveTutorial(activeDriver, 1);
				},
				onPrevClick: (_element, _step, { driver: activeDriver }) => {
					moveTutorial(activeDriver, -1);
				},
			});
			tutorialDriver.drive();
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
						onclick={neverShowTutorialAgain}
						class="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
					>
						Never Show Again
					</button>
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

<style>
	:global(.tutorial-citation-link) {
		color: #2563eb;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	:global(.tutorial-citation-link:hover) {
		color: #1d4ed8;
	}
</style>
