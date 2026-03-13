export interface WidgetTarget {
	wsId: string | null;
	widgetId: string | null;
}

export interface WorkflowStep {
	widgetId: string;
	settings: Record<string, unknown>;
}

export interface PatchWorkflowSettingsParams {
	backendOrigin: string;
	wsId: string;
	steps: WorkflowStep[];
}

export interface PatchWidgetSettingsParams {
	backendOrigin: string;
	wsId: string;
	widgetId: string;
	settings: Record<string, unknown>;
}

/**
 * Creates an empty widget target placeholder.
 * @returns Object with null wsId and widgetId
 */
export function createWidgetTarget(): WidgetTarget {
	return { wsId: null, widgetId: null };
}

/**
 * Creates an embed session with the widget backend. Required before resolving masters or patching settings.
 * @param backendOrigin - Base URL of the widget backend (e.g. from PUBLIC_WIDGET_BACKEND_ORIGIN)
 * @returns Object containing session_id used for forking and iframe embed URLs
 * @throws {Error} When the request fails or returns non-OK status
 */
export async function fetchEmbedSession(
	backendOrigin: string,
): Promise<{ session_id: string }> {
	const url = `${backendOrigin}/api/workflows/embed_session`;
	const res = await fetch(url, {
		method: 'GET',
		credentials: 'include',
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			(err as { message?: string }).message ?? `embed_session failed: HTTP ${res.status}`,
		);
	}
	return res.json();
}

/**
 * Forks a master widget into a work session for the given embed session.
 * Returns the forked workSessionId and widgetId needed for PATCH calls.
 * @param backendOrigin - Base URL of the widget backend
 * @param masterWs - Master workspace ID
 * @param masterWidget - Master widget ID (UUID)
 * @param sessionId - Session ID from fetchEmbedSession
 * @returns Object with workSessionId and widgetId
 * @throws {Error} When the request fails or returns non-OK status
 */
export async function resolveMasterToFork(
	backendOrigin: string,
	masterWs: string,
	masterWidget: string,
	sessionId: string,
): Promise<{ workSessionId: string; widgetId: string }> {
	const url = `${backendOrigin}/api/workflows/embed/${masterWs}/${masterWidget}/${sessionId}`;
	const res = await fetch(url, { method: 'GET', credentials: 'include' });
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			(err as { message?: string }).message ?? `Resolve failed: HTTP ${res.status}`,
		);
	}
	return res.json();
}

/**
 * Patches the full workflow settings for a work session.
 * Sets the ordered list of steps (widget IDs and their settings).
 * Use when the selected dataset or KM endpoint changes.
 * @param params - Backend origin, wsId, and steps array
 * @returns Object with ok (boolean) and status (HTTP status code)
 */
export async function patchWorkflowSettings(
	params: PatchWorkflowSettingsParams,
): Promise<{ ok: boolean; status: number }> {
	const { backendOrigin, wsId, steps } = params;
	const url = `${backendOrigin}/api/widget-properties/workflow-settings/${wsId}`;
	const response = await fetch(url, {
		method: 'PATCH',
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ steps }),
	});

	return { ok: response.ok, status: response.status };
}

/**
 * Patches settings for a single widget within a work session.
 * Use when only one widget needs updating (e.g. KM time/event variables, groupVariable).
 * @param params - Backend origin, wsId, widgetId, and settings object
 * @returns Object with ok (boolean) and status (HTTP status code)
 */
export async function patchWidgetSettings(
	params: PatchWidgetSettingsParams,
): Promise<{ ok: boolean; status: number }> {
	const { backendOrigin, wsId, widgetId, settings } = params;
	const url = `${backendOrigin}/api/widget-properties/settings/${wsId}/${widgetId}`;
	const response = await fetch(url, {
		method: 'PATCH',
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(settings),
	});

	return { ok: response.ok, status: response.status };
}
