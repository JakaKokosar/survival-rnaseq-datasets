<script lang="ts">
	import type { Dataset } from '../../types/dataset';
	import { getReproducibleFormatted } from '../../lib/dataset-utils';

	interface Props {
		dataset: Dataset;
		buildDataFileDownloadUrl: (filename: string) => string;
	}

	let { dataset, buildDataFileDownloadUrl }: Props = $props();
</script>

<header class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
	<h2 class="text-2xl font-bold text-slate-900">{dataset.data_id}</h2>
	<a
		href={dataset.data_url}
		target="_blank"
		rel="noopener noreferrer"
		class="mt-1 inline-flex items-center gap-1 rounded text-sm text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
	<div class="mt-4">
		{#if dataset.data_file_names && dataset.data_file_names.length > 0}
			<div class="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1.75fr)_1px_minmax(0,1fr)] md:items-start md:gap-x-4 md:gap-y-0">
				<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-sm md:min-w-0">
					<dt class="font-medium text-slate-500">Experiment type:</dt>
					<dd class="text-slate-900">{dataset['Experiment type']}</dd>
					<dt class="font-medium text-slate-500">NCBI data availability:</dt>
					<dd class="text-slate-900">
						{dataset['NCBI-generated data'] === 'Available' ? 'Yes' : 'No'}
					</dd>
					<dt class="font-medium text-slate-500">Data reproducibility:</dt>
					<dd class="text-slate-900">{getReproducibleFormatted(dataset.Reproducible)}</dd>
					<dt class="pt-0.5 font-medium text-slate-500">Related publications:</dt>
					<dd class="min-w-0 pt-0.5 text-slate-900">
						{#if dataset.pmcids.length > 0}
							<span class="flex max-w-full flex-wrap items-center gap-x-6 gap-y-0.5">
								{#each dataset.pmcids as pmcid (pmcid)}
									<a
										href="https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"
										target="_blank"
										rel="noopener noreferrer"
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
										<span>{pmcid}</span>
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
					</dd>
				</dl>
				<div class="hidden w-px self-stretch bg-slate-200 md:block"></div>
				<div class="flex flex-col gap-2 md:min-w-0">
					{#each dataset.data_file_names as filename (filename)}
						<a
							href={buildDataFileDownloadUrl(filename)}
							download
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
				<dt class="font-medium text-slate-500">Experiment type:</dt>
				<dd class="text-slate-900">{dataset['Experiment type']}</dd>
				<dt class="font-medium text-slate-500">NCBI data availability:</dt>
				<dd class="text-slate-900">
					{dataset['NCBI-generated data'] === 'Available' ? 'Yes' : 'No'}
				</dd>
				<dt class="font-medium text-slate-500">Data reproducibility:</dt>
				<dd class="text-slate-900">{getReproducibleFormatted(dataset.Reproducible)}</dd>
				<dt class="pt-0.5 font-medium text-slate-500">Related publications:</dt>
				<dd class="min-w-0 pt-0.5 text-slate-900">
					{#if dataset.pmcids.length > 0}
						<span class="flex max-w-full flex-wrap items-center gap-x-6 gap-y-0.5">
							{#each dataset.pmcids as pmcid (pmcid)}
								<a
									href="https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"
									target="_blank"
									rel="noopener noreferrer"
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
									<span>{pmcid}</span>
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
				</dd>
			</dl>
		{/if}
	</div>
	{#if dataset.Notes}
		<div class="mt-4 flex gap-3 rounded-r-lg border border-slate-200 border-l-4 border-l-slate-400 bg-slate-50 p-3">
			<span class="flex-shrink-0 text-slate-500" aria-hidden="true">
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					></path>
				</svg>
			</span>
			<p class="text-sm text-slate-700">{dataset.Notes}</p>
		</div>
	{/if}
</header>
