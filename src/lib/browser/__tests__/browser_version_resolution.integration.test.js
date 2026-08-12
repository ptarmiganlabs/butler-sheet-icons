import { test, expect, describe, beforeAll, afterAll, afterEach } from '@jest/globals';
import 'dotenv/config';

import { browserInstall } from '../browser-install.js';
import { browserInstalled } from '../browser-installed.js';
import { browserUninstall, browserUninstallAll } from '../browser-uninstall.js';
import { detectAvailableBrowser } from '../browser-detect.js';
import { resolveBrowserExecutablePath } from '../browser-launch.js';
import { resolveBrowserVersion, getRecommendedBuildId } from '../browser-version.js';
import { assertEnv, getTestTimeout } from '../../util/env-check.js';
import { makeIsolatedCacheDir, removeIsolatedCacheDir } from '../test-helpers/isolated-cache.js';

// Version resolution against the real Chrome for Testing and Firefox version services, and
// against a real browser cache on disk. The unit suite covers the same decisions with mocks;
// what only an integration test can show is that the vendor services still answer in the shape
// Butler Sheet Icons expects, and that a build resolved from one of them is actually installable.
//
// This is the area issue #878 broke: `latest` resolved to a Chrome build that could not be
// driven, and because cache matching accepted any cached build, two machines on the same commit
// silently ran different browsers.

const defaultTestTimeout = getTestTimeout(process.env, 1800000);

// The "cached browser selection" block installs real browsers and clears the cache after every
// test, so it has to work somewhere other than the developer's own ~/.cache/puppeteer.
const browserCacheDir = makeIsolatedCacheDir();

const options = {
    loglevel: process.env.BSI_LOG_LEVEL || 'info',
    browserCacheDir,
};

// File level rather than per describe: the last block installs a browser and never uninstalls it,
// so cleanup has to outlive every describe in the file.
afterAll(() => {
    removeIsolatedCacheDir(browserCacheDir);
});

describe('browser version resolution', () => {
    beforeAll(() => {
        assertEnv(process.env, { informational: ['BSI_LOG_LEVEL', 'BSI_TEST_TIMEOUT'] });
    });

    /**
     * The default must resolve without contacting any version service, which is what lets a
     * server with no outbound access start from a warm cache. A mocked test cannot prove this:
     * only a real call can show that nothing on this path reaches the network.
     */
    test(
        'the recommended build resolves offline, from a value inside Butler Sheet Icons',
        async () => {
            const resolved = await resolveBrowserVersion('chrome', 'recommended');

            expect(resolved.usedNetwork).toBe(false);
            expect(resolved.buildId).toBe(getRecommendedBuildId('chrome'));
            expect(resolved.buildId).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
        },
        defaultTestTimeout
    );

    /**
     * `stable` has to reach the vendor. Guards against the service changing shape - a silent
     * change there would take out every run that does not use `recommended`.
     */
    test.each([
        ['chrome', /^\d+\.\d+\.\d+\.\d+$/],
        ['firefox', /^stable_\S+$/],
    ])(
        'the stable %s build is resolvable from the vendor',
        async (browser, shape) => {
            const resolved = await resolveBrowserVersion(browser, 'stable');

            expect(resolved.usedNetwork).toBe(true);
            expect(resolved.buildId).toMatch(shape);
        },
        defaultTestTimeout
    );

    /**
     * The two keywords are only worth having as separate words if they can actually differ.
     * They are expected to differ most of the time - `recommended` trails the vendor's stable
     * channel - but they legitimately coincide just after a puppeteer bump, so this asserts the
     * shape rather than inequality.
     */
    test(
        'recommended and stable both resolve to installable builds',
        async () => {
            const recommended = await resolveBrowserVersion('chrome', 'recommended');
            const stable = await resolveBrowserVersion('chrome', 'stable');

            expect(recommended.buildId).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
            expect(stable.buildId).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
        },
        defaultTestTimeout
    );

    /**
     * Every explicit form documented for Chrome, resolved against the real service. A milestone
     * and a build prefix are shorthands the vendor expands; a full build id is passed through.
     */
    test(
        'a milestone and a build prefix both expand to a full build id',
        async () => {
            const stable = await resolveBrowserVersion('chrome', 'stable');
            const milestone = stable.buildId.split('.')[0];
            const prefix = stable.buildId.split('.').slice(0, 3).join('.');

            const fromMilestone = await resolveBrowserVersion('chrome', milestone);
            const fromPrefix = await resolveBrowserVersion('chrome', prefix);

            expect(fromMilestone.buildId).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
            expect(fromPrefix.buildId).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
            expect(fromMilestone.buildId.startsWith(`${milestone}.`)).toBe(true);
            expect(fromPrefix.buildId.startsWith(`${prefix}.`)).toBe(true);
        },
        defaultTestTimeout
    );

    /**
     * A malformed version must be rejected before anything is downloaded. `resolveBuildId`
     * returns unrecognised input verbatim rather than failing, so without the format check a typo
     * reached `canDownload` and surfaced as "cannot be downloaded" - which reads like a network
     * problem and sends the reader after the wrong thing entirely.
     */
    test.each([
        ['chrome', 'garbage'],
        ['chrome', '151.0'],
        ['firefox', '152.0.1'],
    ])(
        'a malformed %s version "%s" is rejected up front',
        async (browser, browserVersion) => {
            await expect(
                browserInstall({ browser, browserVersion, browserCacheDir })
            ).rejects.toThrow(/invalid --browser-version/i);
        },
        defaultTestTimeout
    );

    /**
     * A release channel resolves live through the vendor, like `stable`. Channels worked before
     * the keyword vocabulary existed and administrators use them to track vendor channels; the
     * first cut of the vocabulary rejected them (issue #878 review).
     */
    test(
        'a release channel resolves through the vendor',
        async () => {
            const resolved = await resolveBrowserVersion('chrome', 'beta');

            expect(resolved.usedNetwork).toBe(true);
            expect(resolved.source).toBe('channel');
            expect(resolved.buildId).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
        },
        defaultTestTimeout
    );
});

describe('cached browser selection', () => {
    beforeAll(() => {
        assertEnv(process.env, { informational: ['BSI_LOG_LEVEL', 'BSI_TEST_TIMEOUT'] });
    });

    afterEach(async () => {
        await browserUninstallAll(options);
    });

    /**
     * The regression behind issue #878. With more than one build cached, detection has to return
     * the build that was asked for. Before the fix any cached build of the right type was
     * accepted, in filesystem order - so a CI runner holding a broken build kept using it while
     * another runner on the same commit passed, with no configuration difference between them.
     */
    test(
        'the requested build is chosen when several are cached',
        async () => {
            await browserUninstallAll(options);

            const recommended = await browserInstall({
                browser: 'chrome',
                browserVersion: 'recommended',
                browserCacheDir,
            });
            const stable = await browserInstall({
                browser: 'chrome',
                browserVersion: 'stable',
                browserCacheDir,
            });

            // Only meaningful while the two keywords point at different builds. When a puppeteer
            // bump makes them coincide there is nothing to tell apart, and the assertions below
            // would be vacuous rather than wrong.
            if (recommended.buildId === stable.buildId) {
                const installed = await browserInstalled(options);
                expect(installed.length).toBeGreaterThanOrEqual(1);
                return;
            }

            const installed = await browserInstalled(options);
            expect(installed.length).toEqual(2);

            const foundRecommended = await detectAvailableBrowser(
                { browser: 'chrome', browserCacheDir },
                recommended.buildId
            );
            const foundStable = await detectAvailableBrowser(
                { browser: 'chrome', browserCacheDir },
                stable.buildId
            );

            expect(foundRecommended.buildId).toBe(recommended.buildId);
            expect(foundStable.buildId).toBe(stable.buildId);
            expect(foundRecommended.source).toBe('cache');
        },
        defaultTestTimeout
    );

    /**
     * A build that is not cached must fall through to a download rather than quietly returning
     * whatever else is on disk.
     */
    test(
        'a build that is not cached is reported as absent',
        async () => {
            await browserUninstallAll(options);
            await browserInstall({
                browser: 'chrome',
                browserVersion: 'recommended',
                browserCacheDir,
            });

            const found = await detectAvailableBrowser(
                { browser: 'chrome', browserCacheDir },
                '99.0.1234.56'
            );

            expect(found).toBeNull();
        },
        defaultTestTimeout
    );

    /**
     * `browser uninstall --browser-version recommended` could never match anything before this
     * change: the cache was searched with the raw option value, and cache entries are build ids.
     * The command reported "browser not found" and exited 1.
     */
    test(
        'a browser can be uninstalled by the recommended keyword',
        async () => {
            await browserUninstallAll(options);
            await browserInstall({
                browser: 'chrome',
                browserVersion: 'recommended',
                browserCacheDir,
            });

            const removed = await browserUninstall({
                ...options,
                browser: 'chrome',
                browserVersion: 'recommended',
            });

            expect(removed).toBe(true);
            expect((await browserInstalled(options)).length).toEqual(0);
        },
        defaultTestTimeout
    );

    /**
     * Floating keywords are refused for uninstall: they resolve to whatever the vendor
     * currently publishes, which is not what is cached, so accepting them either deleted the
     * wrong build or reported "not found" after a pointless network round trip. This also keeps
     * uninstall a purely offline operation.
     */
    test(
        'uninstall refuses a floating keyword and leaves the cache alone',
        async () => {
            await browserUninstallAll(options);
            await browserInstall({
                browser: 'chrome',
                browserVersion: 'recommended',
                browserCacheDir,
            });

            const removed = await browserUninstall({
                ...options,
                browser: 'chrome',
                browserVersion: 'stable',
            });

            expect(removed).toBe(false);
            expect((await browserInstalled(options)).length).toEqual(1);
        },
        defaultTestTimeout
    );

    /**
     * The top finding of the issue #878 review: the offline fallback used to swallow EVERY
     * resolution error, so a typo'd --browser-version printed three errors saying the value was
     * invalid and then completed successfully on whatever was cached - a build nobody chose.
     * With a browser cached (the normal state), a malformed version must still fail the run.
     */
    test(
        'a malformed version fails even when a browser is cached',
        async () => {
            await browserUninstallAll(options);
            await browserInstall({
                browser: 'chrome',
                browserVersion: 'recommended',
                browserCacheDir,
            });

            await expect(
                resolveBrowserExecutablePath({
                    browser: 'chrome',
                    browserVersion: 'garbage',
                    browserCacheDir,
                })
            ).rejects.toThrow(/invalid --browser-version/i);
        },
        defaultTestTimeout
    );
});

describe('system browser override', () => {
    let saved;

    beforeAll(() => {
        assertEnv(process.env, { informational: ['BSI_LOG_LEVEL', 'BSI_TEST_TIMEOUT'] });
    });

    afterEach(() => {
        if (saved === undefined) {
            delete process.env.PUPPETEER_EXECUTABLE_PATH;
        } else {
            process.env.PUPPETEER_EXECUTABLE_PATH = saved;
        }
    });

    /**
     * PUPPETEER_EXECUTABLE_PATH wins over any requested build. That is intended - an
     * administrator pointing at a specific binary means it - but it silently ignored
     * --browser-version, so a pinned build appeared to be in use when it was not.
     */
    test(
        'a system browser overrides the requested build, and says so',
        async () => {
            saved = process.env.PUPPETEER_EXECUTABLE_PATH;

            const installed = await browserInstall({
                browser: 'chrome',
                browserVersion: 'recommended',
                browserCacheDir,
            });
            process.env.PUPPETEER_EXECUTABLE_PATH = installed.executablePath;

            const found = await detectAvailableBrowser(
                { browser: 'chrome', browserVersion: '99.0.1234.56', browserCacheDir },
                '99.0.1234.56'
            );

            expect(found.source).toBe('system');
            expect(found.executablePath).toBe(installed.executablePath);
        },
        defaultTestTimeout
    );
});
