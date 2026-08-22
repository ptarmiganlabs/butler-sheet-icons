import { describe, test, expect } from '@jest/globals';

import {
    BsiError,
    CertError,
    EnigmaError,
    CloudError,
    QseowError,
    ExpectedFailure,
    isExpectedFailure,
    reportExpectedFailure,
    EXPECTED_FAILURE_EXIT_CODE,
} from '../errors.js';

describe('BsiError', () => {
    test('is an instance of Error and BsiError', () => {
        const err = new BsiError('boom');
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(BsiError);
        expect(err.name).toBe('BsiError');
        expect(err.message).toBe('boom');
    });

    test('passes through the `cause` option', () => {
        const cause = new Error('original');
        const err = new BsiError('wrapped', { cause });
        expect(err.cause).toBe(cause);
    });
});

describe('Subclasses', () => {
    test('CertError', () => {
        const err = new CertError('bad path');
        expect(err).toBeInstanceOf(BsiError);
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('CertError');
        expect(err.message).toBe('bad path');
    });

    test('EnigmaError', () => {
        const err = new EnigmaError('schema not found');
        expect(err.name).toBe('EnigmaError');
        expect(err.message).toBe('schema not found');
    });

    test('CloudError', () => {
        const err = new CloudError('collection not found');
        expect(err.name).toBe('CloudError');
        expect(err.message).toBe('collection not found');
    });

    test('QseowError', () => {
        const err = new QseowError('sense-version invalid');
        expect(err.name).toBe('QseowError');
        expect(err.message).toBe('sense-version invalid');
    });

    test('subclasses are distinct from each other', () => {
        const ce = new CertError('a');
        const ee = new EnigmaError('b');
        const cle = new CloudError('c');
        const qe = new QseowError('d');

        expect(ce).not.toBeInstanceOf(EnigmaError);
        expect(ce).not.toBeInstanceOf(CloudError);
        expect(ce).not.toBeInstanceOf(QseowError);
        expect(ee).not.toBeInstanceOf(CloudError);
        expect(cle).not.toBeInstanceOf(QseowError);
        expect(qe).not.toBeInstanceOf(CloudError);
    });

    test('subclasses preserve a stack trace', () => {
        const err = new QseowError('x');
        expect(typeof err.stack).toBe('string');
        expect(err.stack).toContain('QseowError');
    });
});

describe('deliberately stopped runs', () => {
    test('ExpectedFailure is a BsiError that marks itself', () => {
        const err = new ExpectedFailure('nothing to do');

        expect(err).toBeInstanceOf(BsiError);
        expect(err.name).toBe('ExpectedFailure');
        expect(err.expected).toBe(true);
        expect(isExpectedFailure(err)).toBe(true);
    });

    // The marker is duck-typed rather than a class check, because the module behind `#extensions`
    // is substituted at build time and cannot import this tree to extend anything in it.
    test('any error carrying the marker counts, whatever its class', () => {
        const plain = Object.assign(new Error('refused'), { expected: true });

        expect(isExpectedFailure(plain)).toBe(true);
    });

    test('an ordinary fault does not count, so the crash path is unchanged', () => {
        expect(isExpectedFailure(new Error('boom'))).toBe(false);
        expect(isExpectedFailure(new BsiError('boom'))).toBe(false);
        expect(isExpectedFailure(new QseowError('boom'))).toBe(false);
    });

    // A truthy-but-not-true value is the shape a careless `expected: 'yes'` would take, and it must
    // not silently suppress a crash dump.
    test('only an exact true counts', () => {
        expect(isExpectedFailure(Object.assign(new Error('x'), { expected: 'yes' }))).toBe(false);
        expect(isExpectedFailure(Object.assign(new Error('x'), { expected: 1 }))).toBe(false);
    });

    test('a non-error is handled rather than throwing from the predicate', () => {
        expect(isExpectedFailure(undefined)).toBe(false);
        expect(isExpectedFailure(null)).toBe(false);
        expect(isExpectedFailure('a string')).toBe(false);
    });
});

describe('what happens to an error that escaped the parse', () => {
    test('a deliberately stopped run is reported and given an exit code', () => {
        const logged = [];
        const code = reportExpectedFailure(new ExpectedFailure('this run may not proceed'), (m) =>
            logged.push(m)
        );

        expect(logged).toEqual(['this run may not proceed']);
        expect(code).toBe(EXPECTED_FAILURE_EXIT_CODE);
    });

    // The half that keeps the safety net a safety net. Swallowing this would turn every fault into
    // a one-line message with no dump and no stack.
    test('a fault is re-thrown unchanged, so it reaches the crash path', () => {
        const fault = new TypeError('opts.split is not a function');
        const logged = [];

        expect(() => reportExpectedFailure(fault, (m) => logged.push(m))).toThrow(fault);
        expect(logged).toEqual([]);
    });

    test('the exit code is the generic failure code, so this change moves none', () => {
        // #1090 defines the graded scheme; until it lands a stopped run exits with what an
        // unhandled throw already produced.
        expect(EXPECTED_FAILURE_EXIT_CODE).toBe(1);
    });
});
