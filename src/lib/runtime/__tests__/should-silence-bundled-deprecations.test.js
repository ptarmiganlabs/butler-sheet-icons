import { describe, it, expect } from '@jest/globals';
import { shouldSilenceBundledDeprecations } from '../should-silence-bundled-deprecations.js';

describe('shouldSilenceBundledDeprecations', () => {
    it('returns false when override is 0', () => {
        const result = shouldSilenceBundledDeprecations({
            env: { BSI_SUPPRESS_DEPRECATIONS: '0' },
            isSeaRuntime: true,
        });

        expect(result).toBe(false);
    });

    it('returns false when override is false', () => {
        const result = shouldSilenceBundledDeprecations({
            env: { BSI_SUPPRESS_DEPRECATIONS: 'false' },
            isSeaRuntime: true,
        });

        expect(result).toBe(false);
    });

    it('returns true when override is 1', () => {
        const result = shouldSilenceBundledDeprecations({
            env: { BSI_SUPPRESS_DEPRECATIONS: '1' },
            isSeaRuntime: false,
        });

        expect(result).toBe(true);
    });

    it('returns true when override is true', () => {
        const result = shouldSilenceBundledDeprecations({
            env: { BSI_SUPPRESS_DEPRECATIONS: 'true' },
            isSeaRuntime: false,
        });

        expect(result).toBe(true);
    });

    it('falls back to SEA runtime flag when no override is present', () => {
        expect(shouldSilenceBundledDeprecations({ env: {}, isSeaRuntime: true })).toBe(true);
        expect(shouldSilenceBundledDeprecations({ env: {}, isSeaRuntime: false })).toBe(false);
    });

    it('treats unexpected values as undefined', () => {
        const result = shouldSilenceBundledDeprecations({
            env: { BSI_SUPPRESS_DEPRECATIONS: 'maybe' },
            isSeaRuntime: true,
        });

        expect(result).toBe(true);
    });
});
