import { describe, test, expect } from '@jest/globals';

// Deliberately mock-free, and in its own file for that reason: this asserts against the real
// puppeteer-core, which the sibling browser_version.test.js replaces with a fixture.
//
// `PUPPETEER_REVISIONS` is the source of the default browser build, and carries an `@internal`
// JSDoc tag even though it is exported from the package root. That makes it the one dependency
// this feature rests on that could disappear in a routine version bump - which would take out
// the default for every user. This is the canary: it fails in CI, at bump time, rather than in
// the field.
describe('the puppeteer-core browser pin', () => {
    test('is exported from the package root', async () => {
        const { PUPPETEER_REVISIONS } = await import('puppeteer-core');

        expect(PUPPETEER_REVISIONS).toBeDefined();
    });

    test('carries build-id-shaped pins for both supported browsers', async () => {
        const { PUPPETEER_REVISIONS } = await import('puppeteer-core/internal/revisions.js');

        // Chrome build ids are four dot-separated numbers, e.g. 150.0.7871.24.
        expect(PUPPETEER_REVISIONS.chrome).toMatch(/^\d+\.\d+\.\d+\.\d+$/);

        // Firefox build ids are channel-prefixed, e.g. stable_152.0.1. A pin that ever arrived
        // unprefixed would be read as a nightly build by @puppeteer/browsers.
        expect(PUPPETEER_REVISIONS.firefox).toMatch(/^(stable|beta|nightly|devedition|esr)_\S+$/);
    });

    test('agrees between the package root and the leaf module the resolver imports', async () => {
        const root = (await import('puppeteer-core')).PUPPETEER_REVISIONS;
        const leaf = (await import('puppeteer-core/internal/revisions.js')).PUPPETEER_REVISIONS;

        expect(leaf.chrome).toBe(root.chrome);
        expect(leaf.firefox).toBe(root.firefox);
    });
});
