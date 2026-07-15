const LOWERCASE_CONNECTORS = new Set(['AND', 'IN', 'OF', 'THE', 'TO', 'VIA']);
const ACRONYMS = new Set([
	'AKT',
	'DNA',
	'E2F',
	'G2M',
	'IFN',
	'IL2',
	'IL6',
	'JAK',
	'MTOR',
	'MTORC1',
	'MYC',
	'NFKB',
	'P53',
	'PI3K',
	'RNA',
	'STAT3',
	'TGF',
	'TNFA',
	'UV',
	'WNT',
]);

export function formatHallmarkName(variableName: string): string {
	return variableName
		.replace(/^HALLMARK_/, '')
		.split('_')
		.filter(Boolean)
		.map((token, index) => {
			if (index > 0 && LOWERCASE_CONNECTORS.has(token)) return token.toLowerCase();
			if (ACRONYMS.has(token) || /\d/.test(token)) return token.toUpperCase();
			return `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`;
		})
		.join(' ');
}
