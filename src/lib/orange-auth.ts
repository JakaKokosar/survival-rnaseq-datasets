const AUTH_DONE_KEY_PREFIX = 'orange4_auth_done_';

function getStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

function buildDoneKey(backendOrigin: string): string {
	return `${AUTH_DONE_KEY_PREFIX}${encodeURIComponent(backendOrigin)}`;
}

function sanitizeAccessCode(accessCode: string | null | undefined): string | null {
	const trimmed = accessCode?.trim();
	return trimmed ? trimmed : null;
}

export function resetOrangeAuth(backendOrigin: string): void {
	getStorage()?.removeItem(buildDoneKey(backendOrigin));
}

/**
 * Silently authenticates with Orange4 by fetching the code-login endpoint.
 * The response sets an auth cookie; no redirect is needed.
 * Resolves to true if auth succeeded (or was already done), false on failure.
 */
export async function ensureOrangeAuth(params: {
	backendOrigin: string;
	accessCode: string | null | undefined;
}): Promise<boolean> {
	const accessCode = sanitizeAccessCode(params.accessCode);
	if (!accessCode) return true;

	const storage = getStorage();
	const doneKey = buildDoneKey(params.backendOrigin);

	if (storage?.getItem(doneKey) === '1') return true;

	const loginUrl = `${params.backendOrigin}/auth/code/login/${encodeURIComponent(accessCode)}`;
	try {
		const res = await fetch(loginUrl, {
			method: 'GET',
			credentials: 'include',
			redirect: 'follow',
		});
		if (!res.ok) {
			console.warn(`[OrangeAuth] Login failed: HTTP ${res.status}`);
			return false;
		}
		storage?.setItem(doneKey, '1');
		return true;
	} catch (error) {
		console.warn('[OrangeAuth] Login fetch failed:', error);
		return false;
	}
}
