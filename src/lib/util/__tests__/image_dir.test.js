import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));
const { logger } = await import('../../../globals.js');

// existsSync drives the container check, which decides which advice is printed.
jest.unstable_mockModule('node:fs', () => ({
    default: { mkdirSync: jest.fn(), existsSync: jest.fn().mockReturnValue(false) },
}));
const fs = (await import('node:fs')).default;

const { createAppImageDir } = await import('../image-dir.js');
const { alreadyReported } = await import('../reported-error.js');

/** Stand-in typed error, matching the (message, { cause }) shape of CloudError/QseowError. */
class TestError extends Error {
    /**
     * Construct a test error carrying an optional cause.
     *
     * @param {string} message - Error message.
     * @param {object} [options] - Error options, including `cause`.
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'TestError';
    }
}

const PARAMS = {
    imagedir: './img',
    platform: 'cloud',
    appId: 'abc123',
    logPrefix: 'CREATE THUMBNAILS 1',
    ErrorClass: TestError,
};

/**
 * Builds an fs error carrying a syscall code, the way Node reports them.
 *
 * @param {string} code - Syscall error code, e.g. `EACCES`.
 * @param {string} message - Error message.
 *
 * @returns {Error} The constructed error.
 */
const fsError = (code, message) => Object.assign(new Error(message), { code });

/**
 * All error lines logged during a test, joined for substring assertions.
 *
 * @returns {string} Every `logger.error` argument, newline separated.
 */
const errorText = () => logger.error.mock.calls.map((call) => call[0]).join('\n');

beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
});

describe('createAppImageDir', () => {
    test('creates the per-app directory and returns its path', () => {
        const dir = createAppImageDir(PARAMS);

        expect(dir).toBe('./img/cloud/abc123');
        expect(fs.mkdirSync).toHaveBeenCalledWith('./img/cloud/abc123', { recursive: true });
    });

    test('builds the path from the platform segment, so the twins stay distinguishable', () => {
        const dir = createAppImageDir({ ...PARAMS, platform: 'qseow', imagedir: '/data' });

        expect(dir).toBe('/data/qseow/abc123');
    });

    test('throws the caller-supplied typed error, with the original attached as cause', () => {
        const cause = fsError('EACCES', 'permission denied');
        fs.mkdirSync.mockImplementation(() => {
            throw cause;
        });

        expect(() => createAppImageDir(PARAMS)).toThrow(TestError);

        try {
            createAppImageDir(PARAMS);
        } catch (err) {
            expect(err.cause).toBe(cause);
            expect(err.message).toContain('./img/cloud/abc123');
        }
    });

    test('marks the failure reported, so outer handlers do not describe it again', () => {
        fs.mkdirSync.mockImplementation(() => {
            throw fsError('EACCES', 'permission denied');
        });

        try {
            createAppImageDir(PARAMS);
        } catch (err) {
            expect(alreadyReported(err)).toBe(true);
        }
    });

    // The whole reason this module exists: outside a container the remedy is "check the account",
    // and there is no reason to talk about Docker at somebody who is not using it.
    test('advises about the running account when a permission error happens outside a container', () => {
        fs.mkdirSync.mockImplementation(() => {
            throw fsError('EACCES', 'permission denied');
        });

        expect(() => createAppImageDir(PARAMS)).toThrow();

        expect(errorText()).toContain('No permission to create the image directory');
        expect(errorText()).toContain('can write to it');
        expect(errorText()).not.toContain('--user');
    });

    // Inside a container the operator cannot see the uid mismatch from the OS error at all, which
    // is what made issue #915 take a full investigation to explain.
    test('explains the host/container ownership mismatch when running in a container', () => {
        fs.existsSync.mockImplementation((p) => p === '/.dockerenv');
        fs.mkdirSync.mockImplementation(() => {
            throw fsError('EACCES', 'permission denied');
        });

        expect(() => createAppImageDir(PARAMS)).toThrow();

        expect(errorText()).toContain('mounted from the host');
        expect(errorText()).toContain('--user "$(id -u):$(id -g)"');
    });

    test('treats EPERM the same as EACCES', () => {
        fs.mkdirSync.mockImplementation(() => {
            throw fsError('EPERM', 'operation not permitted');
        });

        expect(() => createAppImageDir(PARAMS)).toThrow();

        expect(errorText()).toContain('No permission to create the image directory');
    });

    test('names a read-only filesystem rather than blaming permissions', () => {
        fs.mkdirSync.mockImplementation(() => {
            throw fsError('EROFS', 'read-only file system');
        });

        expect(() => createAppImageDir(PARAMS)).toThrow();

        expect(errorText()).toContain('read-only filesystem');
        expect(errorText()).toContain(':ro');
        expect(errorText()).not.toContain('No permission to create');
    });

    // A read-only Docker mount surfaces as ENOENT, not EROFS - verified by running the image with
    // `-v vol:/nodeapp/img:ro`. Without this branch the one case the read-only advice was written
    // for would never reach it.
    test('covers both readings of ENOENT, including a read-only Docker mount', () => {
        fs.mkdirSync.mockImplementation(() => {
            throw fsError('ENOENT', 'no such file or directory');
        });

        expect(() => createAppImageDir(PARAMS)).toThrow();

        expect(errorText()).toContain('exists and is writable');
        expect(errorText()).toContain(':ro');
    });

    test('passes an unrelated failure through with its own message', () => {
        fs.mkdirSync.mockImplementation(() => {
            throw fsError('ENOSPC', 'no space left on device');
        });

        expect(() => createAppImageDir(PARAMS)).toThrow();

        expect(errorText()).toContain('no space left on device');
        expect(errorText()).not.toContain('No permission to create');
        expect(errorText()).not.toContain('read-only filesystem');
    });

    // The stack is diagnostics, not advice - demoting it is what keeps the actionable lines from
    // being buried, the same argument as logUnusableBrowser in browser-launch.js.
    test('keeps the stack at debug level', () => {
        const cause = fsError('EACCES', 'permission denied');
        cause.stack = 'Error: permission denied\n    at somewhere';
        fs.mkdirSync.mockImplementation(() => {
            throw cause;
        });

        expect(() => createAppImageDir(PARAMS)).toThrow();

        expect(logger.debug).toHaveBeenCalledWith(cause.stack);
        expect(errorText()).not.toContain('at somewhere');
    });
});
