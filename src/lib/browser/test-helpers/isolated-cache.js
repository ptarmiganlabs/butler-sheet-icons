import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A private browser cache directory for one integration test file.
 *
 * The browser integration tests install and uninstall real browsers against a
 * real filesystem - that is the point of them, and nothing here mocks any of
 * it. What they must not do is operate on the developer's own cache. Several of
 * them call `browserUninstallAll`, which finishes with `fs.emptyDir` on the
 * cache directory, so a run wipes every browser present, including builds that
 * were staged by hand and that no test installed. That happened on 2026-08-12
 * and cost a cache holding chrome 114.0.5735.133, chrome 151.0.7922.47 and
 * firefox stable_153.0.4.
 *
 * Passing the returned path as `browserCacheDir` in the options bag of every
 * browser call in a test file moves all of that into a throwaway directory:
 * `resolveBrowserCacheDir` in `browser-paths.js` takes that key ahead of every
 * other tier, so it reaches workers the tests call directly, where the
 * `--browser-cache-dir` flag never would.
 *
 * These tests already began by emptying the cache, so they never ran against a
 * warm one; moving to a fresh directory therefore downloads no more than before.
 *
 * @returns {string} Absolute path to a new empty directory.
 */
export const makeIsolatedCacheDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bsi-int-'));

/**
 * Remove a directory created by {@link makeIsolatedCacheDir}.
 *
 * `force` keeps this from throwing when a test failed before anything was
 * installed, so cleanup never masks the real failure.
 *
 * @param {string} dir - The directory to remove.
 *
 * @returns {void}
 */
export const removeIsolatedCacheDir = (dir) => fs.rmSync(dir, { recursive: true, force: true });
