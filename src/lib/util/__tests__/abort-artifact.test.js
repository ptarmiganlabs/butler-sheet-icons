import { describe, test, expect } from '@jest/globals';
import { isAbortArtifact } from '../abort-artifact.js';

describe('isAbortArtifact', () => {
    test('recognises what sleep() rejects with once the run is interrupted', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';

        expect(isAbortArtifact(err)).toBe(true);
    });

    test('recognises the AbortError code as well as the name', () => {
        const err = new Error('aborted');
        err.code = 'ABORT_ERR';

        expect(isAbortArtifact(err)).toBe(true);
    });

    test.each([
        'Protocol error (Page.navigate): Target closed',
        'Session closed. Most likely the page has been closed.',
        'Navigation failed because browser has disconnected!',
    ])('recognises what closing the browser produces: %s', (message) => {
        expect(isAbortArtifact(new Error(message))).toBe(true);
    });

    test('looks down the cause chain, because processors rethrow wrapped', () => {
        const cause = new Error('Protocol error: Target closed');
        const wrapped = new Error('Failed to process QSEoW app abc', { cause });

        expect(isAbortArtifact(wrapped)).toBe(true);
    });

    test.each([
        'Request failed with status code 500',
        'getaddrinfo ENOTFOUND sense.example.com',
        'Sheet 3 could not be read',
    ])('does NOT claim a genuine failure: %s', (message) => {
        // This is the direction that matters. Keyed on the interrupt flag
        // alone, an app failing on a real server error at the moment docker
        // stop arrived was filed as abandoned and dropped out of the verdict's
        // failure count entirely.
        expect(isAbortArtifact(new Error(message))).toBe(false);
    });

    test('survives a non-Error and a nullish value', () => {
        expect(isAbortArtifact(undefined)).toBe(false);
        expect(isAbortArtifact('just a string')).toBe(false);
    });
});
