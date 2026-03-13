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

export function createWidgetTarget(): WidgetTarget {
	return { wsId: null, widgetId: null };
}

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
