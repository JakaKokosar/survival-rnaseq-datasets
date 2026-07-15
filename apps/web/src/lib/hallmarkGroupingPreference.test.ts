import { beforeEach, describe, expect, it } from 'vitest';
import {
	readHallmarkGroupingPreference,
	saveHallmarkGroupingPreference,
} from './hallmarkGroupingPreference';

const storedValues = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
	configurable: true,
	value: {
		getItem: (key: string) => storedValues.get(key) ?? null,
		setItem: (key: string, value: string) => storedValues.set(key, value),
		clear: () => storedValues.clear(),
	},
});

describe('hallmarkGroupingPreference', () => {
	beforeEach(() => window.localStorage.clear());

	it('persists the enabled state across component instances', () => {
		expect(readHallmarkGroupingPreference()).toBe(false);

		saveHallmarkGroupingPreference(true);
		expect(readHallmarkGroupingPreference()).toBe(true);

		saveHallmarkGroupingPreference(false);
		expect(readHallmarkGroupingPreference()).toBe(false);
	});
});
