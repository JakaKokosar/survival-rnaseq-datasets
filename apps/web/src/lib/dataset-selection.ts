import type { Dataset } from '../types/dataset';

export function isUnknownFieldValue(value: string | null | undefined): boolean {
	if (!value) return true;
	const normalized = value.trim().toLowerCase();
	return normalized === '' || normalized === 'unknown';
}

export function isCompleteKMPlotEndpoint(endpoint: Dataset['survival-endpoints'][number]): boolean {
	return (
		!isUnknownFieldValue(endpoint.time_var.var_name) &&
		!isUnknownFieldValue(endpoint.event_var.var_name)
	);
}

export function getKMPlotEndpointKey(endpoint: Dataset['survival-endpoints'][number]): string {
	return `${endpoint.abbrv ?? ''}::${endpoint.time_var.var_name}::${endpoint.event_var.var_name}`;
}

export function getCompleteKMPlotEndpoints(dataset: Dataset | null): Dataset['survival-endpoints'] {
	if (!dataset) return [];
	return dataset['survival-endpoints'].filter(
		(endpoint) => Boolean(endpoint.abbrv) && isCompleteKMPlotEndpoint(endpoint),
	);
}

export function getDefaultEndpointKey(dataset: Dataset | null): string | null {
	const completeEndpoints = getCompleteKMPlotEndpoints(dataset);
	const osEndpoint = completeEndpoints.find((endpoint) => endpoint.abbrv === 'OS');
	if (osEndpoint) return getKMPlotEndpointKey(osEndpoint);
	const firstEndpoint = completeEndpoints[0];
	return firstEndpoint ? getKMPlotEndpointKey(firstEndpoint) : null;
}

export function syncEndpointSelectionForDataset(
	datasets: Dataset[],
	datasetId: string,
	selectedEndpointKey: string | null,
): string | null {
	const dataset = datasets.find((item) => item.data_id === datasetId) ?? null;
	const completeEndpoints = getCompleteKMPlotEndpoints(dataset);
	const hasSelectedEndpoint =
		selectedEndpointKey &&
		completeEndpoints.some((endpoint) => getKMPlotEndpointKey(endpoint) === selectedEndpointKey);

	if (hasSelectedEndpoint) return selectedEndpointKey;
	return getDefaultEndpointKey(dataset);
}
