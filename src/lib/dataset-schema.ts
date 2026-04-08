import { z } from 'zod';
import type { GeoSeriesSummary, RawDataset } from '../types/dataset';

const reproducibleValueSchema = z.enum(['YES', 'NO', 'PARTIALLY']);
const ncbiDataValueSchema = z.enum(['Available', 'Not available']);

const survivalTimeVarSchema = z.object({
	var_name: z.string(),
	var_unit: z.string(),
});

const survivalEventVarSchema = z.object({
	var_name: z.string(),
	var_values: z.union([z.string(), z.array(z.string())]),
	var_meaning: z.string(),
});

const survivalEndpointSchema = z.object({
	abbrv: z.string().optional(),
	time_var: survivalTimeVarSchema,
	event_var: survivalEventVarSchema,
	notes: z.array(z.string()).default([]),
});

const datasetSummarySchema = z.object({
	samples: z.number(),
	clinical_features: z.number(),
	genes: z.number(),
});

export const datasetSchema = z.object({
	data_id: z.string(),
	data_url: z.url(),
	pmcids: z.array(z.string()),
	'survival-endpoints': z.array(survivalEndpointSchema),
	candidate_genes: z.array(z.string()).optional(),
	data_summary: datasetSummarySchema,
	data_file_names: z.array(z.string()).optional(),
	'Experiment type': z.string(),
	Reproducible: reproducibleValueSchema,
	'NCBI-generated data': ncbiDataValueSchema,
	Notes: z.string().optional(),
});

const datasetsSchema = z.array(datasetSchema);

type ParsedDataset = z.infer<typeof datasetSchema>;
type VerifyDatasetCompatibility = ParsedDataset extends RawDataset
	? RawDataset extends ParsedDataset
		? true
		: never
	: never;
const _datasetTypeCompatibilityCheck: VerifyDatasetCompatibility = true;
void _datasetTypeCompatibilityCheck;

const geoSeriesSummarySchema = z.object({
	data_id: z.string(),
	summary: z.string(),
	title: z.string(),
	cancer_type_exact: z.string(),
	cancer_group: z.string(),
});

const geoSeriesSummariesSchema = z.array(geoSeriesSummarySchema);

const pmcidCitationSchema = z.object({
	pmcid: z.string(),
	citation: z.string(),
});

const pmcidCitationsSchema = z.array(pmcidCitationSchema);

export function parseGeoSeriesSummaries(rawData: unknown): Map<string, GeoSeriesSummary> {
	const result = geoSeriesSummariesSchema.safeParse(rawData);
	if (!result.success) {
		const issuePreview = result.error.issues
			.slice(0, 8)
			.map((issue) => `${issue.path.join('.')} - ${issue.message}`)
			.join('; ');
		throw new Error(
			`Invalid geo_series_summaries.json. ${issuePreview}${result.error.issues.length > 8 ? '; ...' : ''}`,
		);
	}
	const map = new Map<string, GeoSeriesSummary>();
	for (const entry of result.data) {
		map.set(entry.data_id, entry);
	}
	return map;
}

export function parsePmcidCitations(rawData: unknown): Map<string, string> {
	const result = pmcidCitationsSchema.safeParse(rawData);
	if (!result.success) {
		const issuePreview = result.error.issues
			.slice(0, 8)
			.map((issue) => `${issue.path.join('.')} - ${issue.message}`)
			.join('; ');
		throw new Error(
			`Invalid pmcid_to_citation.json. ${issuePreview}${result.error.issues.length > 8 ? '; ...' : ''}`,
		);
	}

	const map = new Map<string, string>();
	for (const entry of result.data) {
		map.set(entry.pmcid, entry.citation);
	}
	return map;
}

export function parseDatasets(rawData: unknown): RawDataset[] {
	const result = datasetsSchema.safeParse(rawData);
	if (result.success) return result.data;

	const issuePreview = result.error.issues
		.slice(0, 8)
		.map((issue) => `${issue.path.join('.')} - ${issue.message}`)
		.join('; ');

	throw new Error(
		`Invalid dataset payload in src/data/data_summary.json. ${issuePreview}${
			result.error.issues.length > 8 ? '; ...' : ''
		}`,
	);
}
