export interface DatasetSummary {
	samples: number;
	clinical_features: number;
	genes: number;
}

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
	Reproducible: string;
	'NCBI-generated data': string;
	Notes?: string;
	iframe_urls?: {
		table: string;
		plot: string;
	};
}
