import type { HallmarkRankingResult } from './kmPython';

export const HALLMARK_RANKING_ANALYSIS_VERSION = 'hallmark-logrank-v2';
const SESSION_PREFIX = 'survival-rnaseq:hallmark-ranking:';
const memoryCache = new Map<string, HallmarkRankingResult>();

function cacheKey(datasetId: string, timeCol: string, eventCol: string): string {
	return JSON.stringify([HALLMARK_RANKING_ANALYSIS_VERSION, datasetId, timeCol, eventCol]);
}

function sessionKey(key: string): string {
	return `${SESSION_PREFIX}${key}`;
}

function isRankingResult(value: unknown): value is HallmarkRankingResult {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<HallmarkRankingResult>;
	return (
		candidate.analysisVersion === HALLMARK_RANKING_ANALYSIS_VERSION &&
		Array.isArray(candidate.results) &&
		candidate.results.every(
			(item) =>
				item !== null &&
				typeof item === 'object' &&
				typeof (item as { hallmark?: unknown }).hallmark === 'string' &&
				typeof (item as { status?: unknown }).status === 'string',
		)
	);
}

export function getCachedHallmarkRanking(
	datasetId: string,
	timeCol: string,
	eventCol: string,
): HallmarkRankingResult | null {
	const key = cacheKey(datasetId, timeCol, eventCol);
	const memoryResult = memoryCache.get(key);
	if (memoryResult) return memoryResult;
	if (typeof window === 'undefined') return null;

	try {
		const raw = window.sessionStorage.getItem(sessionKey(key));
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!isRankingResult(parsed)) {
			window.sessionStorage.removeItem(sessionKey(key));
			return null;
		}
		memoryCache.set(key, parsed);
		return parsed;
	} catch {
		return null;
	}
}

export function setCachedHallmarkRanking(
	datasetId: string,
	timeCol: string,
	eventCol: string,
	result: HallmarkRankingResult,
): void {
	if (!isRankingResult(result)) return;
	const key = cacheKey(datasetId, timeCol, eventCol);
	memoryCache.set(key, result);
	if (typeof window === 'undefined') return;
	try {
		window.sessionStorage.setItem(sessionKey(key), JSON.stringify(result));
	} catch {
		// Memory caching still works when storage is unavailable or over quota.
	}
}

export function clearHallmarkRankingMemoryCache(): void {
	memoryCache.clear();
}
