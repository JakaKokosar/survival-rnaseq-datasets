<script lang="ts">
	import type { Dataset, GeoSeriesSummary } from '../../types/dataset';
	import { getReproducibleFormatted, getSearchTextParts } from '../../lib/dataset-utils';

	interface Props {
		dataset: Dataset;
		buildDataFileDownloadUrl: (filename: string) => string;
		summariesMap: Map<string, GeoSeriesSummary>;
		sampleOriginMap: Map<string, string[]>;
		query: string;
	}

	let { dataset, buildDataFileDownloadUrl, summariesMap, sampleOriginMap, query }: Props = $props();

	let seriesSummary = $derived(summariesMap.get(dataset.data_id));
	let sampleOrigins = $derived(sampleOriginMap.get(dataset.data_id) ?? []);
	let relatedPublications = $derived(dataset.related_publications);
	let reproducibilityNoteId = $derived(`reproducibility-note-${dataset.data_id}`);
	const getDataFileLabel = (filename: string) => {
		if (filename.endsWith('_preprocessed.csv')) return 'preprocessed.csv';
		return 'original.csv';
	};
	let dataFiles = $derived.by(() => {
		const filenames = dataset.data_file_names ?? [];
		const metadataByFilename = new Map(
			(dataset.data_files ?? []).map((file) => [file.filename, file]),
		);
		return filenames.map((filename) => ({
			filename,
			label: getDataFileLabel(filename),
			metadata: metadataByFilename.get(filename),
		}));
	});
	const formatFileSize = (bytes: number) => {
		if (bytes < 1_000) return `${bytes} B`;
		if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
		if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
		return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
	};
	let detailTitle = $derived(
		seriesSummary?.title ? `${dataset.data_id} - ${seriesSummary.title}` : dataset.data_id,
	);
</script>

{#snippet highlightedText(value: string)}
	{#each getSearchTextParts(value, query) as part (part)}
		{#if part.isMatch}
			<mark data-search-highlight class="rounded-sm bg-yellow-200 text-inherit">{part.text}</mark>
		{:else}
			{part.text}
		{/if}
	{/each}
{/snippet}

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

<header data-tour="dataset-detail-header" class="dataset-detail-header rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
	<!-- Title row with GEO link -->
	<div class="flex items-start justify-between gap-3">
		<h2 class="text-lg font-bold leading-snug text-slate-900">
			{@render highlightedText(detailTitle)}
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

	<!-- Summary paragraph -->
	{#if seriesSummary}
		<div class="dataset-summary mt-3 border-l-2 border-slate-200 pl-3">
			<p class="dataset-summary-text text-sm leading-relaxed text-slate-600">{@render highlightedText(seriesSummary.summary)}</p>
			<p class="mt-1 text-xs italic text-slate-400">— AI-generated summary</p>
		</div>
	{/if}

	<!-- Metadata -->
	<div class="dataset-metadata mt-4 border-t border-slate-100 pt-4">
		{#if dataFiles.length > 0}
			<div class="dataset-metadata-layout flex flex-col gap-4">
				<section class="min-w-0">
					<dl class="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-sm leading-6 text-slate-900">
						<dt class="font-medium text-slate-500">Sample origin:</dt>
						<dd class="text-slate-900">
							{#if sampleOrigins.length > 0}
								{sampleOrigins.join(', ')}
							{:else}
								—
							{/if}
						</dd>
						<dt class="font-medium text-slate-500">Reproducibility:</dt>
						<dd class="text-slate-900">
							{@render reproducibilityContent()}
						</dd>
						<dt class="font-medium text-slate-500">Publications:</dt>
						<dd class="min-w-0 text-slate-900">
							{@render relatedPublicationContent()}
						</dd>
					</dl>
				</section>
				<section data-tour="prepared-datasets" class="dataset-files min-w-0">
					<h3 class="text-xs font-medium uppercase tracking-wide text-slate-500">Data files</h3>
					<div data-testid="data-files-list" class="mt-1 flex flex-col gap-0.5">
						{#each dataFiles as file (file.filename)}
							<a
								href={buildDataFileDownloadUrl(file.filename)}
								download={file.filename}
								title={file.filename}
								aria-label={`Download ${file.label}`}
								class="group -mx-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded px-2 py-1 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
							>
								<span class="truncate text-sm text-blue-600 group-hover:text-blue-700">
									{file.label}
								</span>
								{#if file.metadata}
									<span class="grid shrink-0 grid-cols-[6rem_auto_3.5rem] items-center gap-x-1.5 text-[11px] leading-4 tabular-nums text-slate-400">
										<span
											title={`${file.metadata.rows.toLocaleString()} rows × ${file.metadata.columns.toLocaleString()} columns`}
											class="text-right"
										>
											{file.metadata.rows.toLocaleString()} × {file.metadata.columns.toLocaleString()}
										</span>
										<span data-testid="data-file-separator" aria-hidden="true" class="justify-self-center text-slate-300">·</span>
										<span class="text-left">{formatFileSize(file.metadata.size_bytes)}</span>
									</span>
								{:else}
									<span aria-hidden="true"></span>
								{/if}
								<svg
									aria-hidden="true"
									class="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-blue-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"
									></path>
								</svg>
							</a>
						{/each}
					</div>
				</section>
			</div>
		{:else}
			<dl class="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-sm leading-6">
				<dt class="font-medium text-slate-500">Sample origin:</dt>
				<dd class="text-slate-900">
					{#if sampleOrigins.length > 0}
						{sampleOrigins.join(', ')}
					{:else}
						—
					{/if}
				</dd>
				<dt class="font-medium text-slate-500">Reproducibility:</dt>
				<dd class="text-slate-900">
					{@render reproducibilityContent()}
				</dd>
				<dt class="font-medium text-slate-500">Publications:</dt>
				<dd class="min-w-0 text-slate-900">
					{@render relatedPublicationContent()}
				</dd>
			</dl>
		{/if}
	</div>

</header>

<style>
	.dataset-detail-header {
		container-type: inline-size;
	}

	@container (min-width: 42rem) {
		.dataset-metadata-layout {
			display: grid;
			grid-template-columns: minmax(18rem, 0.9fr) minmax(0, 1.1fr);
			align-items: start;
			column-gap: 1.5rem;
			row-gap: 0;
		}

		.dataset-files {
			border-left: 1px solid var(--color-slate-200);
			padding-left: 1.5rem;
		}
	}

	@media (min-width: 1024px) and (max-height: 1050px) {
		.dataset-detail-header {
			padding: 1rem;
		}

		.dataset-summary {
			margin-top: 0.5rem;
		}

		.dataset-summary-text {
			line-height: 1.375;
		}

		.dataset-metadata {
			margin-top: 0.75rem;
			padding-top: 0.75rem;
		}
	}
</style>
