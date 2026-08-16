// NOTE: every credential-shaped string in this file is a deliberately fake
// fixture used to prove that redaction works. Nothing here is a real secret and
// nothing here needs revoking or rotating. The file is excluded from secret
// scanning in `.gitguardian.yaml`; see issue #819 for background.

import { describe, test, expect } from '@jest/globals';

import {
    BSI_SECRET_KEYS,
    redactValue,
    redactOptions,
    redactSensitivePatterns,
} from '../redact-secrets.js';

describe('BSI_SECRET_KEYS', () => {
    test('includes the high-risk property names', () => {
        const set = new Set(BSI_SECRET_KEYS.map((k) => k.toLowerCase()));
        for (const name of [
            'logonpwd',
            'apikey',
            'password',
            'pwd',
            'passwd',
            'passphrase',
            'secret',
            'token',
            'authorization',
            'apiKey',
            'api_key',
            'clientSecret',
            'client_secret',
            'BSI_CLOUD_API_KEY',
            'BSI_QSEOW_CST_LOGON_PWD',
        ]) {
            expect(set.has(name.toLowerCase())).toBe(true);
        }
    });
});

describe('redactValue / redactOptions', () => {
    test('passes primitives through unchanged', () => {
        expect(redactValue('hello')).toBe('hello');
        expect(redactValue(42)).toBe(42);
        expect(redactValue(true)).toBe(true);
        expect(redactValue(null)).toBeNull();
        expect(redactValue(undefined)).toBeUndefined();
    });

    test('replaces top-level secret keys', () => {
        const out = redactValue({ logonpwd: 'hunter2', host: 'qs.example.com' });
        expect(out.logonpwd).toBe('***redacted***');
        expect(out.host).toBe('qs.example.com');
    });

    test('matches secret keys case-insensitively', () => {
        const out = redactValue({ LogonPwd: 'hunter2', APIKey: 'xyz' });
        expect(out.LogonPwd).toBe('***redacted***');
        expect(out.APIKey).toBe('***redacted***');
    });

    test('redacts secrets in nested objects and arrays', () => {
        const input = {
            tenanturl: 'https://qs.example.com',
            apikey: 'topsecret',
            children: [
                { logonpwd: 'p1', name: 'a' },
                { logonpwd: 'p2', name: 'b' },
            ],
        };
        const out = redactValue(input);
        expect(out.apikey).toBe('***redacted***');
        expect(out.children[0].logonpwd).toBe('***redacted***');
        expect(out.children[1].logonpwd).toBe('***redacted***');
        expect(out.children[0].name).toBe('a');
        expect(out.tenanturl).toBe('https://qs.example.com');
    });

    test('does not mutate the input', () => {
        const input = { logonpwd: 'hunter2', arr: [{ token: 't' }] };
        const snapshot = JSON.stringify(input);
        redactValue(input);
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    test('breaks cycles without throwing', () => {
        const a = { logonpwd: 'p' };
        a.self = a;
        const out = redactValue(a);
        expect(out.logonpwd).toBe('***redacted***');
        expect(out.self).toBe('***redacted***');
    });

    test('treats class instances as opaque (returns redacted placeholder)', () => {
        /**
         *
         */
        class Secret {
            /**
             * Construct a test secret-bearing class.
             */
            constructor() {
                this.logonpwd = 'p';
            }
        }
        const inst = new Secret();
        const out = redactValue(inst);
        expect(out).toBe('***redacted***');
    });

    test('redactOptions is an alias for redactValue', () => {
        const out = redactOptions({ apikey: 'x' });
        expect(out.apikey).toBe('***redacted***');
    });
});

describe('redactSensitivePatterns', () => {
    test('returns empty string for non-string input', () => {
        expect(redactSensitivePatterns(undefined)).toBe('');
        expect(redactSensitivePatterns(null)).toBe('');
        expect(redactSensitivePatterns(42)).toBe('');
    });

    test('redacts basic auth in URLs', () => {
        const input = 'failed to connect to https://user:secret@qlik.example.com/api';
        const out = redactSensitivePatterns(input);
        expect(out).not.toContain('user:secret');
        expect(out).toContain('[REDACTED]@');
    });

    test('redacts Bearer / Basic / Token headers', () => {
        const a = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.fake.sig';
        const b = 'Authorization: Basic dXNlcjpwYXNz';
        const c = 'Authorization: Token abcdefghijklmnop';

        expect(redactSensitivePatterns(a)).toMatch(/Bearer\s+\[REDACTED\]/);
        expect(redactSensitivePatterns(b)).toMatch(/Basic\s+\[REDACTED\]/);
        expect(redactSensitivePatterns(c)).toMatch(/Token\s+\[REDACTED\]/);
    });

    test('redacts an Authorization header however it is spelled or quoted', () => {
        // The stringified-config form: what reaches the log when a caller does
        // JSON.stringify(err) on an axios error.
        expect(
            redactSensitivePatterns('{"Authorization":"Bearer eyJhbGciOiJIUzI1NiJ9.fake.sig"}')
        ).toBe('{"Authorization":"Bearer [REDACTED]"}');
        expect(redactSensitivePatterns('proxy-authorization: Basic dXNlcjpwYXNz')).toBe(
            'proxy-authorization: Basic [REDACTED]'
        );
    });

    test('redacts a bare scheme when what follows is credential-shaped', () => {
        // No Authorization header name in front, as in a stack trace or a server
        // error. Mixed case, digits, dots and long lowercase runs are credentials.
        expect(redactSensitivePatterns('Basic dXNlcjpwYXNz')).toBe('Basic [REDACTED]');
        expect(redactSensitivePatterns('bearer eyJhbGciOi.payload.sig')).toBe('bearer [REDACTED]');
        expect(redactSensitivePatterns('Token abcdefghijklmnopqrstuvwxyz')).toBe(
            'Token [REDACTED]'
        );
    });

    test('leaves prose that merely contains a scheme keyword alone', () => {
        // Issue #949: the rule used to eat the word after `token`, so the message
        // an operator gets for a missing --apikey read "API token [REDACTED] is
        // required" - as though a token value had been found and hidden.
        for (const text of [
            'API token parameter is required',
            'the token parameter',
            'Basic authentication is required',
            'no token available for tenant',
            'token successfully refreshed',
            'Token retrieval failed',
        ]) {
            expect(redactSensitivePatterns(text)).toBe(text);
        }
    });

    test('does not redact a bare scheme followed by a plain lowercase word', () => {
        // The deliberate cost of the fix above (issue #949): an all-lowercase
        // credential of 8-23 characters, with no Authorization header name and no
        // `token=` delimiter, is indistinguishable from an English word and is
        // left alone. Qlik Cloud API keys are JWTs, so they stay covered by the
        // cases above. Change this test only alongside that trade-off.
        expect(redactSensitivePatterns('Token abcdefghijklmnop')).toBe('Token abcdefghijklmnop');
    });

    test('redacts common key=value secret patterns', () => {
        expect(redactSensitivePatterns('password=hunter2')).toBe('password=[REDACTED]');
        expect(redactSensitivePatterns('api_key=abcdef123')).toBe('api_key=[REDACTED]');
        expect(redactSensitivePatterns('clientSecret: topsecret')).toBe('clientSecret=[REDACTED]');
        expect(redactSensitivePatterns('token:abc123def')).toBe('token=[REDACTED]');
        expect(redactSensitivePatterns('access-key=ak_12345')).toBe('access-key=[REDACTED]');
        expect(redactSensitivePatterns('logonpwd=hunter2')).toBe('logonpwd=[REDACTED]');
    });

    test('redacts JSON-style quoted secrets', () => {
        const input = `body: {"password": "hunter2", "user": "admin"}`;
        const out = redactSensitivePatterns(input);
        expect(out).toContain('"password": "[REDACTED]"');
        expect(out).toContain('"user": "admin"');
        expect(out).not.toContain('hunter2');
    });

    test('redacts logonpwd in JSON-style quoted secrets', () => {
        const input = `body: {"logonpwd": "hunter2", "user": "admin"}`;
        const out = redactSensitivePatterns(input);
        expect(out).toContain('"logonpwd": "[REDACTED]"');
        expect(out).toContain('"user": "admin"');
        expect(out).not.toContain('hunter2');
    });

    test('leaves benign text alone', () => {
        expect(redactSensitivePatterns('starting run for app a3e0f5d2')).toBe(
            'starting run for app a3e0f5d2'
        );
        expect(redactSensitivePatterns('connected to qlik.example.com')).toBe(
            'connected to qlik.example.com'
        );
    });
});
