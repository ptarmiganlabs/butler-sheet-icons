import path from 'node:path';
import { homedir } from 'node:os';

/**
 * Where Butler Sheet Icons keeps downloaded browsers.
 *
 * This lives in its own module, with no dependency on `@puppeteer/browsers`,
 * because almost every module in this directory needs the path and only two
 * need the cache's contents. Putting it beside `getBrowserInventory` would drag
 * `getInstalledBrowsers` and `detectBrowserPlatform` into the import graph of
 * every caller - which, in a codebase whose tests mock `@puppeteer/browsers` by
 * enumerating its exports, turns a one-line change into churn across five test
 * files for no benefit.
 *
 * Computed on every call rather than captured in a module constant, so a test
 * that mocks `os.homedir` still gets its own answer - an import-time constant
 * would be fixed before the mock was installed.
 *
 * @returns {string} Absolute path to the browser cache directory.
 */
export const getBrowserCacheDir = () => path.join(homedir(), '.cache/puppeteer');
