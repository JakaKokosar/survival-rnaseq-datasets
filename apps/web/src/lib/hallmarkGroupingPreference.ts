const HALLMARK_GROUPING_KEY = 'datasetBrowserHallmarkGroupingEnabled';

export function readHallmarkGroupingPreference(): boolean {
	try {
		return window.localStorage.getItem(HALLMARK_GROUPING_KEY) === 'true';
	} catch {
		return false;
	}
}

export function saveHallmarkGroupingPreference(enabled: boolean): void {
	try {
		window.localStorage.setItem(HALLMARK_GROUPING_KEY, String(enabled));
	} catch {
		// The in-memory UI state still works when local storage is unavailable.
	}
}
