import type { Dataset } from '../types/dataset';
import {
	fetchEmbedSession,
	patchWidgetSettings,
	patchWorkflowSettings,
	resolveMasterToFork,
	type WorkflowStep,
} from './widget-api';
import { getCompleteKMPlotEndpoints, getKMPlotEndpointKey } from './dataset-selection';

export interface WidgetMastersConfig {
	masterWs: string;
	masterDatasetWidget: string;
	masterKmWidget: string;
}

/**
 * Orchestrates widget backend session init and PATCH synchronization.
 * Creates an embed session, forks master widgets (dataset + KM), and syncs
 * user selections (dataset, endpoint, candidate gene) to the backend via PATCH.
 * Call initSession once on mount; patch* methods are triggered by DatasetBrowser
 * when selection state changes (typically debounced).
 */
export class DatasetBrowserSyncController {
	private wsId: string | null = null;
	private datasetWidgetId: string | null = null;
	private kmWidgetId: string | null = null;
	private lastDatasetId: string | null = null;
	private lastEndpointKey: string | null = null;
	private lastGroupVariable: string | null = null;

	constructor(
		private readonly backendOrigin: string,
		private readonly datasets: Dataset[],
	) {}

	/**
	 * Creates embed session and forks master dataset + KM widgets.
	 * Call once on component mount. Returns session_id for iframe embed URLs.
	 * @param config - Master workspace and widget IDs for dataset and KM widgets
	 * @returns session_id used to build widget iframe src URLs
	 */
	async initSession(config: WidgetMastersConfig): Promise<string> {
		const session = await fetchEmbedSession(this.backendOrigin);
		const [datasetData, kmData] = await Promise.all([
			resolveMasterToFork(
				this.backendOrigin,
				config.masterWs,
				config.masterDatasetWidget,
				session.session_id,
			),
			resolveMasterToFork(
				this.backendOrigin,
				config.masterWs,
				config.masterKmWidget,
				session.session_id,
			),
		]);

		this.wsId = datasetData.workSessionId;
		this.datasetWidgetId = datasetData.widgetId;
		this.kmWidgetId = kmData.widgetId;

		return session.session_id;
	}

	/**
	 * Reuses an existing session_id: resolves master widgets without calling embed_session.
	 * Use when restoring from sessionStorage to avoid creating duplicate forks on remount.
	 * @param sessionId - Existing session_id (e.g. from sessionStorage)
	 * @param config - Master workspace and widget IDs for dataset and KM widgets
	 * @returns session_id (same as input) for consistency
	 */
	async initWithSessionId(sessionId: string, config: WidgetMastersConfig): Promise<string> {
		const [datasetData, kmData] = await Promise.all([
			resolveMasterToFork(
				this.backendOrigin,
				config.masterWs,
				config.masterDatasetWidget,
				sessionId,
			),
			resolveMasterToFork(
				this.backendOrigin,
				config.masterWs,
				config.masterKmWidget,
				sessionId,
			),
		]);

		this.wsId = datasetData.workSessionId;
		this.datasetWidgetId = datasetData.widgetId;
		this.kmWidgetId = kmData.widgetId;

		return sessionId;
	}

	/**
	 * Full workflow PATCH — sets the dataset URL and KM endpoint together.
	 * Call when the selected dataset changes. Skips if datasetId and endpointKey
	 * match the last successful call (deduplication).
	 * @param datasetId - Selected dataset data_id
	 * @param endpointKey - Selected KM plot endpoint key (or null)
	 */
	async patchWorkflow(datasetId: string, endpointKey: string | null): Promise<void> {
		if (!this.wsId || !this.datasetWidgetId) return;
		if (datasetId === this.lastDatasetId && endpointKey === this.lastEndpointKey) return;

		const steps = this.buildWorkflowSteps(datasetId, endpointKey);
		if (steps.length === 0) return;

		try {
			await patchWorkflowSettings({
				backendOrigin: this.backendOrigin,
				wsId: this.wsId,
				steps,
			});
			this.lastDatasetId = datasetId;
			this.lastEndpointKey = endpointKey;
		} catch (error) {
			console.warn('Workflow PATCH failed', error);
		}
	}

	/**
	 * Single-widget PATCH — updates only the KM widget's time/event variables.
	 * Call when the endpoint changes within the same dataset. Skips if
	 * endpointKey matches the last successful call.
	 * @param datasetId - Selected dataset data_id
	 * @param endpointKey - Selected KM plot endpoint key
	 */
	async patchKmEndpoint(datasetId: string, endpointKey: string): Promise<void> {
		if (!this.wsId || !this.kmWidgetId) return;
		if (endpointKey === this.lastEndpointKey) return;

		const dataset = this.datasets.find((item) => item.data_id === datasetId);
		if (!dataset) return;

		const settings = this.buildKmSettings(dataset, endpointKey);
		if (!settings) return;

		try {
			await patchWidgetSettings({
				backendOrigin: this.backendOrigin,
				wsId: this.wsId,
				widgetId: this.kmWidgetId,
				settings,
			});
			this.lastEndpointKey = endpointKey;
		} catch (error) {
			console.warn('KM endpoint PATCH failed', error);
		}
	}

	/**
	 * Single-widget PATCH — updates the KM widget's group variable (candidate gene).
	 * Call when the selected candidate gene changes. Skips if gene matches
	 * the last successful call.
	 * @param gene - Selected candidate gene name
	 */
	async patchGroupVariable(gene: string | null): Promise<void> {
		if (!this.wsId || !this.kmWidgetId || !gene?.trim()) return;
		if (gene === this.lastGroupVariable) return;

		try {
			await patchWidgetSettings({
				backendOrigin: this.backendOrigin,
				wsId: this.wsId,
				widgetId: this.kmWidgetId,
				settings: { groupVariable: gene },
			});
			this.lastGroupVariable = gene;
		} catch (error) {
			console.warn('KM settings PATCH failed', error);
		}
	}

	private buildKmSettings(
		dataset: Dataset,
		endpointKey: string,
	): Record<string, unknown> | null {
		const completeEndpoints = getCompleteKMPlotEndpoints(dataset);
		const endpoint = completeEndpoints.find((ep) => getKMPlotEndpointKey(ep) === endpointKey);
		if (!endpoint) return null;

		const settings: Record<string, unknown> = {};
		if (endpoint.time_var.var_name && endpoint.time_var.var_name !== 'unknown') {
			settings.timeVariable = endpoint.time_var.var_name;
		}
		if (endpoint.event_var.var_name && endpoint.event_var.var_name !== 'unknown') {
			settings.eventVariable = endpoint.event_var.var_name;
		}
		return Object.keys(settings).length > 0 ? settings : null;
	}

	private buildWorkflowSteps(datasetId: string, endpointKey: string | null): WorkflowStep[] {
		const dataset = this.datasets.find((item) => item.data_id === datasetId);
		if (!dataset) return [];

		const datasetUrl = `${this.backendOrigin}/files/sample-data/${dataset.data_id}_preprocessed_sample.tab`;
		const steps: WorkflowStep[] = [
			{
				widgetId: this.datasetWidgetId!,
				settings: { selectedInput: 'url', url: datasetUrl },
			},
		];

		const completeEndpoints = getCompleteKMPlotEndpoints(dataset);
		const selectedEndpoint =
			(endpointKey
				? completeEndpoints.find((ep) => getKMPlotEndpointKey(ep) === endpointKey)
				: null) ??
			completeEndpoints.find((ep) => ep.abbrv === 'OS') ??
			completeEndpoints[0] ??
			null;

		if (this.kmWidgetId && selectedEndpoint) {
			const kmSettings: Record<string, unknown> = {};
			if (selectedEndpoint.time_var.var_name && selectedEndpoint.time_var.var_name !== 'unknown') {
				kmSettings.timeVariable = selectedEndpoint.time_var.var_name;
			}
			if (selectedEndpoint.event_var.var_name && selectedEndpoint.event_var.var_name !== 'unknown') {
				kmSettings.eventVariable = selectedEndpoint.event_var.var_name;
			}
			if (Object.keys(kmSettings).length > 0) {
				steps.unshift({ widgetId: this.kmWidgetId, settings: kmSettings });
			}
		}

		return steps;
	}
}
