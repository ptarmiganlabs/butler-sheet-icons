/**
 * Jest configuration. Mirrors the modern setup used in butler-sos:
 * - .mjs extension for explicit ESM
 * - explicit testEnvironment
 * - minimal config; rely on Jest defaults where reasonable
 * - keep BSI-specific coverage and roots
 *
 * Unit vs integration tests are split by filename suffix:
 * - `*.test.js`          → unit tests (`npm run test:unit`)
 * - `*.integration.test.js` → integration tests (`npm run test:integration`)
 *
 * Notes:
 * - Neither `--detectOpenHandles` nor `--forceExit` is in the `jest` script. They were, and they
 *   worked against each other: `--forceExit` meant a suite that genuinely leaked a handle finished
 *   in silence, exactly like one that did not. `npm run jest:handles` turns the detector back on for
 *   an investigation.
 *
 *   Expect false positives when it is on. Measured for issue #951: axios pipes every compressed
 *   response through `stream.pipeline([res, unzip])`, and Node registers a `STREAM_END_OF_STREAM`
 *   async resource per stream in that pipeline. Some of those are never destroyed, and they carry no
 *   `hasRef`, so Jest's collectHandles treats them as permanently active and reports them - even
 *   though `process._getActiveHandles()` is empty and the process exits on its own. Because Jest
 *   substitutes the *triggering* resource's stack, the report blames the `await axios(config)` call
 *   in `src/lib/cloud/cloud-repo-request.js`, which is a red herring: the Qlik Cloud calls there are
 *   fine, and gzip is the only reason those handles exist. Every response from a server that
 *   compresses will do this. A hung suite is the signal worth chasing, not this report.
 *
 * - `transform: {}` and `transformIgnorePatterns: []` are kept empty to allow
 *   the one legacy test (`butler-sheet-icons.test.js`) that still uses
 *   CJS-style `jest.mock(...)` to work. New tests should use the ESM-native
 *   `jest.unstable_mockModule(...)` + dynamic import pattern instead.
 */

/** @type {import('jest').Config} */
const config = {
    clearMocks: true,
    collectCoverage: true,
    collectCoverageFrom: ['<rootDir>/src/**/*.js'],
    coverageDirectory: 'coverage',
    // Every coverage exclusion lives here rather than being split between negative globs in
    // `collectCoverageFrom` and this list. The two forms were measured as producing an
    // identical report (same 53 files, same percentages), so one list is preferred simply
    // because there is then one place to look.
    //
    // Each entry is load-bearing; measured, not assumed:
    //
    // `/__tests__/` — Jest skips instrumenting a test file it RUNS, but `test:unit` filters
    // the `*.integration.test.js` files out of the run, so they are neither run nor skipped
    // and land in the report as 0%-covered source. Removing this entry puts those 8 files
    // back and drops the reported total by roughly nine points — measured at 87.2% with it
    // against 78.3% without. Treat the gap as the point, not the absolute figures: those
    // move with every test added.
    //
    // `/test-helpers/` — shared fixtures are plain .js, so `src/**/*.js` would otherwise
    // count them as production source at 0%.
    //
    // `import-meta-url.js` is a generated SEA shim. It is excluded from ESLint
    // (eslint.config.js) and from SonarCloud analysis (sonar-project.properties); keeping it
    // out of the coverage report too stops Sonar warning that it cannot resolve a path
    // present in lcov.info but absent from the analysed file set.
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/build/',
        '/dist/',
        '/__tests__/',
        '/test-helpers/',
        'src/lib/util/import-meta-url\\.js$',
    ],
    coverageProvider: 'v8',
    // preserve-exit-code: restores `process.exitCode` around every test. Command handlers set it
    // to 1 on failure and do not rethrow, so a test covering a failure path would otherwise leave
    // the runner's own exit status at 1 with every suite reported green.
    //
    // restore-plain-console: integration suites swap Jest's buffered console for a real one so
    // Winston log lines print plainly instead of each being wrapped in a `console.log` frame
    // blaming winston's transport. Unit suites are left untouched.
    //
    // See each file for the full account.
    setupFilesAfterEnv: [
        '<rootDir>/src/lib/test-helpers/preserve-exit-code.js',
        '<rootDir>/src/lib/test-helpers/restore-plain-console.js',
    ],
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    transform: {},
    transformIgnorePatterns: [],
};

export default config;
