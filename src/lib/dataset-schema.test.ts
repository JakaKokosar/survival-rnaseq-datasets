import { describe, expect, it } from 'vitest';
import pmcidCitations from '../data/pmcid_to_citation.json';
import { parsePmcidCitations } from './dataset-schema';

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
