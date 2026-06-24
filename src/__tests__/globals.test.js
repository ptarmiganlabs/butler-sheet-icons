import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

let logger;
let originalWarningListeners;
let originalNoProcessWarnings;

beforeAll(async () => {
    originalWarningListeners = process.listeners('warning');
    originalNoProcessWarnings = process.noProcessWarnings;
    process.removeAllListeners('warning');

    ({ logger } = await import('../globals.js'));
});

afterAll(() => {
    process.removeAllListeners('warning');
    for (const listener of originalWarningListeners) {
        process.on('warning', listener);
    }

    try {
        process.noProcessWarnings = originalNoProcessWarnings;
    } catch {
        // Ignore: the property is read-only in some environments.
    }
});

describe('logger redaction', () => {
    test('redacts Error messages and stacks after winston materializes them', () => {
        const err = new Error('logonpwd=hunter2');
        const transformed = logger.format.transform(err, logger.format.options);

        expect(transformed.message).toBe('logonpwd=[REDACTED]');
        expect(transformed.stack).toContain('Error: logonpwd=[REDACTED]');
        expect(transformed.stack).not.toContain('hunter2');
    });

    test('redacts Symbol.for("splat") metadata values', () => {
        const splat = Symbol.for('splat');
        const transformed = logger.format.transform(
            {
                level: 'info',
                message: 'request failed',
                [splat]: [{ logonpwd: 'hunter2' }, '******'],
            },
            logger.format.options
        );

        expect(transformed[splat]).toEqual([{ logonpwd: '***redacted***' }, '******']);
    });
});
