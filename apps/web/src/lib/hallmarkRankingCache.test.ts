import { beforeEach, describe, expect, it } from 'vitest';
import type { HallmarkRankingResult } from './kmPython';
import {
	clearHallmarkRankingMemoryCache,
	getCachedHallmarkRanking,
	setCachedHallmarkRanking,
} from './hallmarkRankingCache';

const result: HallmarkRankingResult = {
	analysisVersion: 'hallmark-logrank-v2',
	results: [
		{
			hallmark: 'HALLMARK_HYPOXIA',
			cutoff: 0.25,
			n: 20,
			lowN: 10,
			highN: 10,
			lowEvents: 4,
			highEvents: 8,
			statistic: 5.1,
			pValue: 0.024,
			status: 'ok',
		},
	],
};

describe('hallmarkRankingCache', () => {
	beforeEach(() => {
		clearHallmarkRankingMemoryCache();
		window.sessionStorage.clear();
	});

	it('restores results from session storage after the memory cache is cleared', () => {
		setCachedHallmarkRanking('GSE1', 'os.time', 'os.event', result);
		clearHallmarkRankingMemoryCache();

		expect(getCachedHallmarkRanking('GSE1', 'os.time', 'os.event')).toEqual(result);
	});

	it('keeps dataset and endpoint entries isolated', () => {
		setCachedHallmarkRanking('GSE1', 'os.time', 'os.event', result);

		expect(getCachedHallmarkRanking('GSE2', 'os.time', 'os.event')).toBeNull();
		expect(getCachedHallmarkRanking('GSE1', 'pfs.time', 'pfs.event')).toBeNull();
	});

	it('discards malformed session entries', () => {
		setCachedHallmarkRanking('GSE1', 'os.time', 'os.event', result);
		clearHallmarkRankingMemoryCache();
		const key = window.sessionStorage.key(0);
		if (!key) throw new Error('Expected a session cache entry');
		window.sessionStorage.setItem(key, '{"analysisVersion":"wrong","results":[]}');

		expect(getCachedHallmarkRanking('GSE1', 'os.time', 'os.event')).toBeNull();
		expect(window.sessionStorage.getItem(key)).toBeNull();
	});
});
