import { describe, test, expect } from '@jest/globals';

import { getErrorCategory, getErrorMetadata } from '../error-categorizer.js';

describe('getErrorCategory', () => {
    test('returns "unknown" for null/undefined', () => {
        expect(getErrorCategory(null)).toBe('unknown');
        expect(getErrorCategory(undefined)).toBe('unknown');
        expect(getErrorCategory(0)).toBe('unknown');
    });

    test('classifies timeout errors', () => {
        expect(getErrorCategory({ code: 'ETIMEDOUT' })).toBe('timeout');
        expect(getErrorCategory({ code: 'ECONNABORTED' })).toBe('timeout');
        expect(getErrorCategory({ message: 'request timeout exceeded' })).toBe('timeout');
        expect(getErrorCategory({ name: 'RequestTimedOutError' })).toBe('timeout');
    });

    test('classifies connection errors by code', () => {
        expect(getErrorCategory({ code: 'ECONNREFUSED' })).toBe('connection_refused');
        expect(getErrorCategory({ code: 'ENOTFOUND' })).toBe('host_not_found');
        expect(getErrorCategory({ code: 'ECONNRESET' })).toBe('connection_reset');
    });

    test('classifies HTTP 4xx errors', () => {
        expect(getErrorCategory({ response: { status: 401 } })).toBe('auth_error');
        expect(getErrorCategory({ response: { status: 403 } })).toBe('auth_error');
        expect(getErrorCategory({ response: { status: 404 } })).toBe('not_found');
        expect(getErrorCategory({ response: { status: 429 } })).toBe('rate_limited');
        expect(getErrorCategory({ response: { status: 418 } })).toBe('http_4xx');
    });

    test('classifies HTTP 5xx errors', () => {
        expect(getErrorCategory({ response: { status: 500 } })).toBe('http_5xx');
        expect(getErrorCategory({ response: { status: 503 } })).toBe('http_5xx');
        expect(getErrorCategory({ response: { status: 599 } })).toBe('http_5xx');
    });

    test('classifies certificate / TLS errors by message', () => {
        expect(getErrorCategory({ message: 'self signed certificate' })).toBe('certificate_error');
        expect(getErrorCategory({ message: 'TLS handshake failed' })).toBe('certificate_error');
        expect(getErrorCategory({ message: 'SSL routines crashed' })).toBe('certificate_error');
    });

    test('falls back to "unknown" for anything else', () => {
        expect(getErrorCategory(new Error('weird failure'))).toBe('unknown');
        expect(getErrorCategory({})).toBe('unknown');
    });
});

describe('getErrorMetadata', () => {
    test('returns a flat metadata object with category and code', () => {
        const meta = getErrorMetadata({ code: 'ETIMEDOUT', message: 'timed out' });
        expect(meta.error_category).toBe('timeout');
        expect(meta.error_code).toBe('ETIMEDOUT');
        expect(meta.http_status).toBeNull();
    });

    test('extracts axios-style response status', () => {
        const meta = getErrorMetadata({ response: { status: 503 } });
        expect(meta.http_status).toBe(503);
        expect(meta.error_category).toBe('http_5xx');
    });

    test('strips the query string from the request URL', () => {
        const meta = getErrorMetadata({
            config: { url: 'https://qs.example.com/api/v1/items?token=abc&id=42' },
        });
        expect(meta.request_url).toBe('https://qs.example.com/api/v1/items');
    });

    test('falls back to a no-query split when URL parse fails', () => {
        const meta = getErrorMetadata({ config: { url: 'not a real url?foo=bar' } });
        expect(meta.request_url).toBe('not a real url');
    });

    test('passes through configured timeout when present', () => {
        const meta = getErrorMetadata({ config: { url: 'https://x', timeout: 30000 } });
        expect(meta.request_timeout_ms).toBe(30000);
    });

    test('extracts network-level cause (address/port/syscall)', () => {
        const meta = getErrorMetadata({
            code: 'ECONNREFUSED',
            cause: { address: '10.0.0.1', port: 4242, syscall: 'connect' },
        });
        expect(meta.remote_address).toBe('10.0.0.1');
        expect(meta.remote_port).toBe(4242);
        expect(meta.syscall).toBe('connect');
    });

    test('handles missing / null inputs gracefully', () => {
        expect(getErrorMetadata(null).error_category).toBe('unknown');
        expect(getErrorMetadata(undefined).error_code).toBe('');
    });
});
