import { describe, expect, it } from 'vitest';
import { formatHallmarkName } from './hallmarkNames';

describe('formatHallmarkName', () => {
	it('removes the prefix and formats pathway names for display', () => {
		expect(formatHallmarkName('HALLMARK_P53_PATHWAY')).toBe('P53 Pathway');
		expect(formatHallmarkName('HALLMARK_ESTROGEN_RESPONSE_EARLY')).toBe('Estrogen Response Early');
	});

	it('preserves common pathway acronyms and lowercases connectors', () => {
		expect(formatHallmarkName('HALLMARK_TNFA_SIGNALING_VIA_NFKB')).toBe('TNFA Signaling via NFKB');
		expect(formatHallmarkName('HALLMARK_PI3K_AKT_MTOR_SIGNALING')).toBe('PI3K AKT MTOR Signaling');
	});
});
