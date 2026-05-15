export interface DatasetSummary {
	samples: number;
	clinical_features: number;
	genes: number;
}

export type ReproducibleValue = 'YES' | 'NO' | 'PARTIALLY';
export type NcbiDataValue = 'Available' | 'Not available';

export interface SurvivalTimeVar {
	var_name: string;
	var_unit: string;
}

export interface SurvivalEventVar {
	var_name: string;
	var_values: string[] | string;
	var_meaning: string;
}

export interface SurvivalEndpointStats {
	n_incomplete: number;
	n_complete: number;
	n_censored: number;
	n_events: number;
	censored_ratio: number;
}

export interface SurvivalEndpoint {
	abbrv?: string;
	time_var: SurvivalTimeVar;
	event_var: SurvivalEventVar;
	notes: string[];
	stats?: SurvivalEndpointStats;
}

export interface GeoSeriesSummary {
	data_id: string;
	summary: string;
	title: string;
	cancer_type_exact: string;
	cancer_group: string;
}

export interface RelatedPublication {
	pmcid: string;
	citation: string;
	url: string;
}

export interface RawDataset {
	data_id: string;
	data_url: string;
	pmcids: string[];
	'survival-endpoints': SurvivalEndpoint[];
	candidate_genes?: string[];
	data_summary: DatasetSummary;
	data_file_names?: string[];
	'Experiment type': string;
	Reproducible: ReproducibleValue;
	'NCBI-generated data': NcbiDataValue;
	Notes?: string;
}

export interface Dataset extends RawDataset {
	related_publications: RelatedPublication[];
}
