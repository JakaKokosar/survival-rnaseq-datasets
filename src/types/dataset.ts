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

export interface SurvivalEndpoint {
	abbrv?: string;
	time_var: SurvivalTimeVar;
	event_var: SurvivalEventVar;
	notes: string[];
}

export interface Dataset {
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
