export interface KmPoint {
	time: number;
	survival: number;
	atRisk: number;
	events: number;
	censors: number;
	varianceSum: number;
	ciLow: number;
	ciHigh: number;
}

export interface CensorTick {
	time: number;
	survival: number;
}

export interface KmSeries {
	key: string;
	label: string;
	color: string;
	total: number;
	events: number;
	median: number | null;
	points: KmPoint[];
	censorTicks: CensorTick[];
}

export interface KmResult {
	series: KmSeries[];
	numericColumns: string[];
}

export interface KmEnv {
	python: string;
	lifelines: string;
}

type KmComputeFn = (
	csvText: string,
	timeCol: string,
	eventCol: string,
	groupCol: string | null,
) => string | Promise<string>;

export function getKmEnv(): KmEnv | null {
	if (typeof window === 'undefined') return null;
	const raw = window.kmPythonEnv;
	if (!raw) return null;
	try {
		return JSON.parse(raw) as KmEnv;
	} catch {
		return null;
	}
}

export function kmReady(): Promise<void> {
	if (typeof window === 'undefined') return new Promise(() => {});
	if (window.kmPythonReady && typeof window.kmPythonCompute === 'function') {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const check = () => {
			if (window.kmPythonReady && typeof window.kmPythonCompute === 'function') {
				window.removeEventListener('kmpython:ready', check);
				resolve();
			}
		};
		window.addEventListener('kmpython:ready', check);
		check();
	});
}

export async function computeKm(
	csvText: string,
	timeCol: string,
	eventCol: string,
	groupCol: string | null,
): Promise<KmResult> {
	await kmReady();
	const fn = window.kmPythonCompute;
	if (!fn) throw new Error('Python KM bridge not initialized');
	const raw = await fn(csvText, timeCol, eventCol, groupCol);
	return JSON.parse(raw) as KmResult;
}

declare global {
	interface Window {
		kmPythonCompute?: KmComputeFn;
		kmPythonReady?: boolean;
		kmPythonEnv?: string;
	}
}
