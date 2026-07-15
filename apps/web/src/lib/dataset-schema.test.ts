import { describe, expect, it } from 'vitest';
import { rawData, rawPmcidToCitation as pmcidCitations } from '../data';
import { parseDatasets, parsePmcidCitations } from './dataset-schema';

describe('parsePmcidCitations', () => {
	it('parses the real pmcid_to_citation dataset into a PMCID lookup map', () => {
		const result = parsePmcidCitations(pmcidCitations);

		expect(result).toBeInstanceOf(Map);
		expect(result.get('PMC7446376')).toBe('Brueffer et al., JCO Precis Oncol, 2018');
		expect(result.size).toBe(pmcidCitations.length);
	});

	it('throws a descriptive error for invalid payloads', () => {
		expect(() =>
			parsePmcidCitations([{ pmcid: 'PMC123' }]),
		).toThrow(/Invalid pmcid_to_citation\.json/);
	});
});

describe('parseDatasets', () => {
	it('preserves endpoint summary stats from the real data summary payload', () => {
		const datasets = parseDatasets(rawData);
		const endpointWithStats = datasets
			.flatMap((dataset) => dataset['survival-endpoints'])
			.find((endpoint) => endpoint.stats);

		expect(endpointWithStats?.stats).toMatchObject({
			n_incomplete: expect.any(Number),
			n_complete: expect.any(Number),
			n_censored: expect.any(Number),
			n_events: expect.any(Number),
			censored_ratio: expect.any(Number),
		});
	});
});
