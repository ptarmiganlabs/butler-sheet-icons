import { describe, test, expect, jest } from '@jest/globals';

import {
    sheetWasStillLoading,
    stillLoadingWarning,
    SENSE_LOADING_CLASS_FRAGMENTS,
} from '../sheet-loading.js';

describe('sheetWasStillLoading', () => {
    test('reports the loading screen when the page finds a visible loader', async () => {
        const page = { evaluate: jest.fn().mockResolvedValue(true) };

        await expect(sheetWasStillLoading(page)).resolves.toBe(true);
    });

    test('reports nothing when the page finds none', async () => {
        const page = { evaluate: jest.fn().mockResolvedValue(false) };

        await expect(sheetWasStillLoading(page)).resolves.toBe(false);
    });

    test('hands the page the observed Sense loader class fragments', async () => {
        const page = { evaluate: jest.fn().mockResolvedValue(false) };

        await sheetWasStillLoading(page);

        const [, fragments] = page.evaluate.mock.calls[0];
        expect(fragments).toEqual([...SENSE_LOADING_CLASS_FRAGMENTS]);
        expect(fragments).toContain('qv-loader-container');
    });

    test('does not treat senseloader-block-ui as a loading indicator', async () => {
        // It looks like one - it is visible on every mid-load sample - but it is visible on a
        // fully rendered sheet too, indefinitely: measured against a live Qlik Sense client,
        // still visible 20 seconds after the charts had drawn and the real loader elements had
        // gone. Including it reported every sheet of every run as still loading.
        expect([...SENSE_LOADING_CLASS_FRAGMENTS]).not.toContain('senseloader-block-ui');
    });

    test('a failed check never costs the run its thumbnail', async () => {
        // This runs on the capture path of a working run. The screenshot is the product; a
        // detector that throws must not take it down, so the caller is told "not loading"
        // and the run proceeds exactly as it did before this check existed.
        const page = {
            evaluate: jest.fn().mockRejectedValue(new Error('Execution context destroyed')),
        };
        const logger = { debug: jest.fn() };

        await expect(sheetWasStillLoading(page, logger)).resolves.toBe(false);
        expect(logger.debug).toHaveBeenCalled();
    });

    test('survives a page that cannot evaluate at all', async () => {
        // Older callers, and every test double that predates this check, hand over a page
        // object with no evaluate() on it.
        await expect(sheetWasStillLoading({})).resolves.toBe(false);
    });

    test('matches loader classes as substrings, because Sense mixes animation classes in', async () => {
        // The live client showed `qv-loader-container qs-pong-loader-logo qv-fade-in
        // qv-loader-huge` on one frame and `... ng-animate qv-loader-huge-add-active` on the
        // next. An exact class-name match would see the first and miss the second.
        const page = {
            evaluate: jest.fn(async (fn, fragments) => {
                const html = [
                    '<div class="qv-animate qv-loader-container qs-pong-loader-logo qv-fade-in"></div>',
                ].join('');
                return fragments.some((fragment) => html.includes(fragment));
            }),
        };

        await expect(sheetWasStillLoading(page)).resolves.toBe(true);
    });
});

describe('stillLoadingWarning', () => {
    test('names the sheet, what the image really shows, and the option that fixes it', () => {
        const warning = stillLoadingWarning('QSEOW APP', 4, 'Regional sales', 1);

        expect(warning).toContain('Sheet 4');
        expect(warning).toContain('Regional sales');
        expect(warning).toContain('loading screen');
        // Without the current value the reader cannot tell what to raise it from.
        expect(warning).toContain('--pagewait (currently 1)');
        // The thumbnail is not withheld, and saying so stops a reader hunting for a failure.
        expect(warning).toContain('uploaded and assigned anyway');
    });
});
