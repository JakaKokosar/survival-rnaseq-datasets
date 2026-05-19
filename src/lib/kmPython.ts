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

interface KmWorker {
	sync: {
		compute_km: KmComputeFn;
		get_env: () => string | Promise<string>;
	};
}

const PYSCRIPT_VERSION = '2026.3.1';
const PYSCRIPT_CORE_CSS = `https://pyscript.net/releases/${PYSCRIPT_VERSION}/core.css`;
const PYSCRIPT_CORE_JS = `https://pyscript.net/releases/${PYSCRIPT_VERSION}/core.js`;
const KM_SCRIPT_SRC = '/py/km.py';
const KM_SCRIPT_CONFIG = { packages: ['lifelines'] };

let kmRuntimePromise: Promise<void> | null = null;
let kmWorker: KmWorker | null = null;

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

function runAfterInitialPaint(callback: () => void): void {
	if (typeof window === 'undefined') return;
	window.setTimeout(() => {
		if ('requestIdleCallback' in window) {
			window.requestIdleCallback(callback, { timeout: 1500 });
			return;
		}
		callback();
	}, 0);
}

function appendStylesheet(href: string): void {
	if (document.querySelector(`link[href="${href}"]`)) return;
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = href;
	document.head.append(link);
}

async function createKmWorker(): Promise<KmWorker> {
	const { PyWorker } = (await import(/* @vite-ignore */ PYSCRIPT_CORE_JS)) as {
		PyWorker: (src: string, options: { config: typeof KM_SCRIPT_CONFIG; type: 'pyodide' }) => KmWorker;
	};
	return PyWorker(KM_SCRIPT_SRC, { config: KM_SCRIPT_CONFIG, type: 'pyodide' });
}

export function ensureKmRuntimeLoaded(): Promise<void> {
	if (typeof window === 'undefined') return new Promise(() => {});
	if (window.kmPythonReady && (typeof window.kmPythonCompute === 'function' || kmWorker)) {
		return Promise.resolve();
	}
	if (kmRuntimePromise) return kmRuntimePromise;

	kmRuntimePromise = new Promise((resolve, reject) => {
		const onReady = () => {
			if (window.kmPythonReady && (typeof window.kmPythonCompute === 'function' || kmWorker)) {
				window.removeEventListener('kmpython:ready', onReady);
				resolve();
			}
		};
		window.addEventListener('kmpython:ready', onReady);
		onReady();

		runAfterInitialPaint(() => {
			appendStylesheet(PYSCRIPT_CORE_CSS);
			createKmWorker()
				.then(async (worker) => {
					kmWorker = worker;
					window.kmPythonEnv = await worker.sync.get_env();
					window.kmPythonReady = true;
					window.dispatchEvent(new Event('kmpython:ready'));
					window.removeEventListener('kmpython:ready', onReady);
					resolve();
				})
				.catch((error: unknown) => {
					window.removeEventListener('kmpython:ready', onReady);
					kmRuntimePromise = null;
					reject(error);
				});
		});
	});

	return kmRuntimePromise;
}

export function kmReady(): Promise<void> {
	if (typeof window === 'undefined') return new Promise(() => {});
	if (window.kmPythonReady && (typeof window.kmPythonCompute === 'function' || kmWorker)) {
		return Promise.resolve();
	}
	return ensureKmRuntimeLoaded();
}

export async function computeKm(
	csvText: string,
	timeCol: string,
	eventCol: string,
	groupCol: string | null,
): Promise<KmResult> {
	await kmReady();
	const fn = kmWorker?.sync.compute_km ?? window.kmPythonCompute;
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
