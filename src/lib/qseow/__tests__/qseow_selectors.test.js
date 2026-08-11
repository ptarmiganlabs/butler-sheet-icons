import { describe, expect, test } from '@jest/globals';

import {
    DEFAULT_QSEOW_SENSE_VERSION,
    QSEOW_SENSE_VERSIONS,
    getQseowHubSelectors,
} from '../qseow-selectors.js';

describe('QSEoW Sense-version selectors', () => {
    test('has a hub user-menu selector for every supported Sense version', () => {
        for (const senseVersion of QSEOW_SENSE_VERSIONS) {
            const selectors = getQseowHubSelectors(senseVersion);

            expect(selectors.userMenuButton).toEqual(expect.stringContaining('xpath/'));
            expect(selectors.legacyLogoutButton).toEqual(expect.stringContaining('xpath/'));
        }
    });

    test('uses 2026-May as the default and maps it to the modern hub toolbar', () => {
        expect(DEFAULT_QSEOW_SENSE_VERSION).toBe('2026-May');
        const selectors = getQseowHubSelectors('2026-May');

        expect(selectors.userMenuButton).toContain('q-hub-toolbar');
        expect(selectors.legacyLogoutButton).toContain('/li[4]/span[2]');
    });

    test('returns undefined for an unsupported Sense version', () => {
        expect(getQseowHubSelectors('2030-Nov')).toBeUndefined();
    });
});
