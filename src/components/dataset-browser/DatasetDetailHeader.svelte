<script lang="ts">
	import type { Dataset, GeoSeriesSummary } from '../../types/dataset';
	import { getReproducibleFormatted } from '../../lib/dataset-utils';

	interface Props {
		dataset: Dataset;
		buildDataFileDownloadUrl: (filename: string) => string;
		summariesMap: Map<string, GeoSeriesSummary>;
	}

	let { dataset, buildDataFileDownloadUrl, summariesMap }: Props = $props();

	let seriesSummary = $derived(summariesMap.get(dataset.data_id));
	let relatedPublications = $derived(dataset.related_publications);
	let reproducibilityNoteId = $derived(`reproducibility-note-${dataset.data_id}`);
</script>

{#snippet relatedPublicationContent()}
	{#if relatedPublications.length > 0}
		<span class="flex max-w-full flex-wrap items-center gap-x-6 gap-y-0.5">
			{#each relatedPublications as publication (publication.pmcid)}
				<a
					href={publication.url}
					target="_blank"
					rel="noopener noreferrer"
					title={publication.pmcid}
					class="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
				>
					<svg class="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
						></path>
					</svg>
					<span>{publication.citation}</span>
					<svg class="h-3 w-3 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
						></path>
					</svg>
				</a>
			{/each}
		</span>
	{:else}
		<span class="italic text-slate-400">No publications linked</span>
	{/if}
{/snippet}

{#snippet reproducibilityContent()}
	<span class="inline-flex items-center gap-1">
		<span>{getReproducibleFormatted(dataset.Reproducible)}</span>
		{#if dataset.Notes}
			<span class="group relative inline-flex">
				<button
					type="button"
					class="inline-flex rounded text-amber-600 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
					aria-label="Reproducibility warning"
					aria-describedby={reproducibilityNoteId}
				>
					<svg aria-hidden="true" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						></path>
					</svg>
				</button>
				<span
					id={reproducibilityNoteId}
					role="tooltip"
					class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-72 max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-950 opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
				>
					{dataset.Notes}
				</span>
			</span>
		{/if}
	</span>
{/snippet}

<header data-tour="dataset-detail-header" class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
	<!-- Title row with GEO link -->
	<div class="flex items-start justify-between gap-3">
		<h2 class="text-lg font-bold leading-snug text-slate-900">
			{seriesSummary?.title ?? dataset.data_id}
		</h2>
		<a
			href={dataset.data_url}
			target="_blank"
			rel="noopener noreferrer"
			class="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded text-sm text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
		>
			<span>View on NCBI GEO</span>
			<svg aria-hidden="true" class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
				></path>
			</svg>
		</a>
	</div>

	<!-- Subtitle: cancer type · samples · experiment type -->
	<p class="mt-1.5 text-sm text-slate-500">
		<span class="font-medium text-slate-600">{dataset.data_id}</span>
		{#if seriesSummary}
			<span class="mx-1.5 text-slate-300">&middot;</span>
			<span class="capitalize">{seriesSummary.cancer_type_exact}</span>
		{/if}
		<span class="mx-1.5 text-slate-300">&middot;</span>
		<span>{dataset.data_summary.samples.toLocaleString()} samples</span>
		<span class="mx-1.5 text-slate-300">&middot;</span>
		<span>{dataset['Experiment type']}</span>
	</p>

	<!-- Summary paragraph -->
	{#if seriesSummary}
		<div class="mt-3 border-l-2 border-slate-200 pl-3">
			<p class="text-sm leading-relaxed text-slate-600">{seriesSummary.summary}</p>
			<p class="mt-1 text-xs italic text-slate-400">— AI-generated summary</p>
		</div>
	{/if}

	<!-- Metadata -->
	<div class="mt-4 border-t border-slate-100 pt-4">
		{#if dataset.data_file_names && dataset.data_file_names.length > 0}
			<div class="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1.75fr)_1px_minmax(0,1fr)] md:items-start md:gap-x-4 md:gap-y-0">
				<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-sm md:min-w-0">
					<dt class="font-medium text-slate-500">NCBI data availability:</dt>
					<dd class="text-slate-900">
						{dataset['NCBI-generated data'] === 'Available' ? 'Yes' : 'No'}
					</dd>
					<dt class="font-medium text-slate-500">Data reproducibility:</dt>
					<dd class="text-slate-900">
						{@render reproducibilityContent()}
					</dd>
					<dt class="pt-0.5 font-medium text-slate-500">Related publications:</dt>
					<dd class="min-w-0 pt-0.5 text-slate-900">
						{@render relatedPublicationContent()}
					</dd>
				</dl>
				<div class="hidden w-px self-stretch bg-slate-200 md:block"></div>
				<div data-tour="prepared-datasets" class="flex flex-col gap-2 md:min-w-0">
					{#each dataset.data_file_names as filename (filename)}
						<a
							href={buildDataFileDownloadUrl(filename)}
							download={filename}
							class="inline-flex items-start gap-1.5 rounded text-sm text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
						>
							<svg aria-hidden="true" class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
								></path>
							</svg>
							<span class="break-words whitespace-normal md:max-w-[360px] lg:max-w-[520px]">{filename}</span>
						</a>
					{/each}
				</div>
			</div>
		{:else}
			<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-sm">
				<dt class="font-medium text-slate-500">NCBI data availability:</dt>
				<dd class="text-slate-900">
					{dataset['NCBI-generated data'] === 'Available' ? 'Yes' : 'No'}
				</dd>
				<dt class="font-medium text-slate-500">Data reproducibility:</dt>
				<dd class="text-slate-900">
					{@render reproducibilityContent()}
				</dd>
				<dt class="pt-0.5 font-medium text-slate-500">Related publications:</dt>
				<dd class="min-w-0 pt-0.5 text-slate-900">
					{@render relatedPublicationContent()}
				</dd>
			</dl>
		{/if}
	</div>

</header>
