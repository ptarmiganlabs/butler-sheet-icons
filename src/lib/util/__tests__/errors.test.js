import { describe, test, expect } from '@jest/globals';

import { BsiError, CertError, EnigmaError, CloudError, QseowError } from '../errors.js';

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
    });

    test('subclasses preserve a stack trace', () => {
        const err = new QseowError('x');
        expect(typeof err.stack).toBe('string');
        expect(err.stack).toContain('QseowError');
    });
});
