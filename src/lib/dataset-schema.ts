import { z } from 'zod';
import type { Dataset } from '../types/dataset';

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
type VerifyDatasetCompatibility = ParsedDataset extends Dataset
	? Dataset extends ParsedDataset
		? true
		: never
	: never;
const _datasetTypeCompatibilityCheck: VerifyDatasetCompatibility = true;
void _datasetTypeCompatibilityCheck;

export function parseDatasets(rawData: unknown): Dataset[] {
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
