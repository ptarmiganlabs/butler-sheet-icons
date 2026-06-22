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
    coveragePathIgnorePatterns: ['/node_modules/', '/build/', '/dist/'],
    coverageProvider: 'v8',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    transform: {},
    transformIgnorePatterns: [],
};

export default config;
