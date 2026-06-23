import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
    redactSecret,
    describePlain,
    formatSecret,
    checkEnv,
    assertEnv,
    getTestTimeout,
} from '../env-check.js';

describe('env-check', () => {
    describe('redactSecret', () => {
        test('returns "missing" for undefined', () => {
            expect(redactSecret(undefined)).toBe('missing');
        });
        test('returns "missing" for empty string', () => {
            expect(redactSecret('')).toBe('missing');
        });
        test('returns "missing" for whitespace-only', () => {
            expect(redactSecret('   ')).toBe('missing');
        });
        test('returns present with length and last4 for short value', () => {
            expect(redactSecret('abc')).toBe('present (length=3, last4=****abc)');
        });
        test('returns present with length and last4 for long value', () => {
            // 'eyJhbGciOiJIUzI1NiJ9.fakeSig' is 28 chars: 19 header + '.' + 7 signature.
            expect(redactSecret('eyJhbGciOiJIUzI1NiJ9.fakeSig')).toBe(
                'present (length=28, last4=****eSig)'
            );
        });
        test('trims surrounding whitespace before measuring length', () => {
            expect(redactSecret('  abc  ')).toBe('present (length=3, last4=****abc)');
        });
    });

    describe('describePlain', () => {
        test('returns "missing" for undefined', () => {
            expect(describePlain(undefined)).toBe('missing');
        });
        test('returns "missing" for empty string', () => {
            expect(describePlain('')).toBe('missing');
        });
        test('returns present with JSON-quoted value for normal string', () => {
            expect(describePlain('hello')).toBe('present (="hello")');
        });
        test('returns present with JSON-escaped value containing special chars', () => {
            expect(describePlain('a"b\\c')).toBe('present (="a\\"b\\\\c")');
        });
        test('trims whitespace from value', () => {
            expect(describePlain('  hello  ')).toBe('present (="hello")');
        });
    });

    describe('formatSecret with diagnostic', () => {
        test('omits diagnostic by default (matches redactSecret output)', () => {
            const result = formatSecret('eyJhbGciOiJIUzI1NiJ9.fakeSig');
            expect(result).toBe('present (length=28, last4=****eSig)');
            expect(result).not.toContain('raw=');
            expect(result).not.toContain('firstByteHex=');
            expect(result).not.toContain('lastByteHex=');
        });
        test('includes diagnostic when opt-in', () => {
            const result = formatSecret('eyJhbGciOiJIUzI1NiJ9.fakeSig', { diagnostic: true });
            expect(result).toContain('raw=28');
            expect(result).toContain('trimmed=28');
            expect(result).toContain('firstByteHex=0x65');
            expect(result).toContain('lastByteHex=0x67');
            expect(result).toContain('last4=****eSig');
        });
        test('detects trailing CR (0x0D) in raw value (the Windows CRLF signature)', () => {
            const result = formatSecret('eyJhbGciOiJIUzI1NiJ9.fakeSig\r', { diagnostic: true });
            expect(result).toContain('raw=29');
            expect(result).toContain('trimmed=28');
            expect(result).toContain('lastByteHex=0x0D');
        });
        test('detects trailing LF (0x0A) in raw value', () => {
            const result = formatSecret('eyJhbGciOiJIUzI1NiJ9.fakeSig\n', { diagnostic: true });
            expect(result).toContain('raw=29');
            expect(result).toContain('trimmed=28');
            expect(result).toContain('lastByteHex=0x0A');
        });
        test('returns "missing" for empty value (with or without diagnostic)', () => {
            expect(formatSecret('')).toBe('missing');
            expect(formatSecret('', { diagnostic: true })).toBe('missing');
        });
    });

    describe('checkEnv', () => {
        test('empty env, all mandatory missing', () => {
            const result = checkEnv({}, { mandatory: ['A', 'B'] });
            expect(result.isValid).toBe(false);
            expect(result.errors).toEqual(['A: missing', 'B: missing']);
            expect(result.lines).toContain('  - A: missing');
            expect(result.lines).toContain('  - B: missing');
        });

        test('all mandatory present, isValid=true', () => {
            const result = checkEnv({ A: 'value1', B: 'value2' }, { mandatory: ['A', 'B'] });
            expect(result.isValid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        test('whitespace-only values count as missing', () => {
            const result = checkEnv({ A: '   ' }, { mandatory: ['A'] });
            expect(result.isValid).toBe(false);
            expect(result.errors).toEqual(['A: missing']);
        });

        test('XOR with none set produces error', () => {
            const result = checkEnv({}, { xor: [['A', 'B']] });
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('At least one of [A, B]');
        });

        test('XOR with one set is valid and lists both members in output', () => {
            const result = checkEnv({ A: 'value' }, { xor: [['A', 'B']] });
            expect(result.isValid).toBe(true);
            expect(result.lines).toContain('  - A: present (="value")');
            expect(result.lines).toContain('  - B: missing');
        });

        test('XOR with both set is valid', () => {
            const result = checkEnv({ A: '1', B: '2' }, { xor: [['A', 'B']] });
            expect(result.isValid).toBe(true);
        });

        test('secret vars are redacted, non-secrets are plain', () => {
            // 'supersecret' is 11 chars; 'visible' is 7 chars.
            const result = checkEnv(
                { SECRET: 'supersecret', PUBLIC: 'visible' },
                { mandatory: ['SECRET', 'PUBLIC'], secret: ['SECRET'] }
            );
            expect(result.isValid).toBe(true);
            expect(result.lines).toContain('  - SECRET: present (length=11, last4=****cret)');
            expect(result.lines).toContain('  - PUBLIC: present (="visible")');
        });

        test('informational vars appear in output but never fail', () => {
            const result = checkEnv({}, { informational: ['LOG_LEVEL'] });
            expect(result.isValid).toBe(true);
            expect(result.lines).toContain('  - LOG_LEVEL: missing');
        });

        test('diagnostic flag in config is honored for secret lines', () => {
            // 'supersecret' is 11 chars. Put it in both informational (so the
            // line is rendered) and secret (so the formatter is used).
            const result = checkEnv(
                { SECRET: 'supersecret' },
                { informational: ['SECRET'], secret: ['SECRET'], diagnostic: true }
            );
            const secretLine = result.lines.find((l) => l.startsWith('  - SECRET:'));
            expect(secretLine).toBeDefined();
            expect(secretLine).toContain('raw=11');
            expect(secretLine).toContain('trimmed=11');
        });

        test('renders the standard header and footer lines', () => {
            const result = checkEnv({}, {});
            expect(result.lines[0]).toBe('--- Integration test env sanity check ---');
            expect(result.lines[result.lines.length - 1]).toBe(
                '------------------------------------------'
            );
        });
    });

    describe('assertEnv', () => {
        let logSpy;
        beforeEach(() => {
            logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        });
        afterEach(() => {
            logSpy.mockRestore();
        });

        test('does not throw when isValid=true', () => {
            expect(() => assertEnv({ A: 'value' }, { mandatory: ['A'] })).not.toThrow();
        });

        test('throws multi-line Error when isValid=false', () => {
            expect(() => assertEnv({}, { mandatory: ['A', 'B'] })).toThrow(Error);
            try {
                assertEnv({}, { mandatory: ['A', 'B'] });
            } catch (err) {
                expect(err.message).toContain('Integration test prerequisites not met');
                expect(err.message).toContain('A: missing');
                expect(err.message).toContain('B: missing');
            }
        });

        test('custom label appears in thrown message', () => {
            try {
                assertEnv({}, { mandatory: ['A'] }, { label: 'Custom label here' });
                throw new Error('expected to throw');
            } catch (err) {
                expect(err.message).toContain('Custom label here');
                expect(err.message).not.toContain('Integration test prerequisites not met');
            }
        });

        test('diagnostic:true flag adds raw byte info to secret lines (via checkEnv)', () => {
            // Use checkEnv directly to avoid cross-talk with the spy that captures
            // jest's own output. 'value\r' is 6 chars (5 + CR), trimmed = 5.
            // The var must be in `secret:` for the secret formatter to apply.
            const { lines } = checkEnv(
                { SECRET: 'value\r' },
                { informational: ['SECRET'], secret: ['SECRET'], diagnostic: true }
            );
            const secretLine = lines.find((l) => l.includes('SECRET:'));
            expect(secretLine).toBeDefined();
            expect(secretLine).toContain('raw=6');
            expect(secretLine).toContain('trimmed=5');
            expect(secretLine).toContain('lastByteHex=0x0D');
        });

        test('logs every line from checkEnv to console.log', () => {
            assertEnv({ A: '1' }, { mandatory: ['A'], informational: ['LOG'] });
            expect(logSpy).toHaveBeenCalled();
            const allCalls = logSpy.mock.calls.flat().join('\n');
            expect(allCalls).toContain('Mandatory vars');
            expect(allCalls).toContain('Informational vars');
            expect(allCalls).toContain('A: present');
            expect(allCalls).toContain('LOG: missing');
        });
    });

    describe('getTestTimeout', () => {
        let logSpy;
        beforeEach(() => {
            logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        });
        afterEach(() => {
            logSpy.mockRestore();
        });

        test('returns defaultMs when env var is missing or empty', () => {
            expect(getTestTimeout({})).toBe(1200000);
            expect(getTestTimeout({ BSI_TEST_TIMEOUT: '' })).toBe(1200000);
            expect(getTestTimeout({}, 1800000)).toBe(1800000);
        });

        test('returns env value when set to a positive integer', () => {
            expect(getTestTimeout({ BSI_TEST_TIMEOUT: '600000' })).toBe(600000);
        });

        test('falls back to default when env value is invalid (non-numeric, zero, negative)', () => {
            expect(getTestTimeout({ BSI_TEST_TIMEOUT: 'not-a-number' })).toBe(1200000);
            expect(getTestTimeout({ BSI_TEST_TIMEOUT: '0' })).toBe(1200000);
            expect(getTestTimeout({ BSI_TEST_TIMEOUT: '-1' })).toBe(1200000);
        });

        test('logs the resolved value with the standard message', () => {
            getTestTimeout({ BSI_TEST_TIMEOUT: '5000' });
            expect(logSpy).toHaveBeenCalledWith('Jest timeout: 5000');
        });
    });
});
