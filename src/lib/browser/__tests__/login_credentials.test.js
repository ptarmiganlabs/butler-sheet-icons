import { jest, describe, test, expect, beforeEach } from '@jest/globals';

import { checkLoginCredentials, CLOUD_LOGON_CREDENTIALS } from '../login-credentials.js';

/** Stands in for CloudError, so the tests can assert the platform class is used. */
class TestError extends Error {}

const logger = { warn: jest.fn() };

/**
 * Runs the check with defaults for everything a test does not care about.
 *
 * @param {object} options - The options bag under test.
 *
 * @returns {void}
 */
const check = (options) =>
    checkLoginCredentials(options, {
        credentials: CLOUD_LOGON_CREDENTIALS,
        logPrefix: 'CLOUD',
        ErrorClass: TestError,
        logger,
    });

const ALL_CLOUD = { logonuserid: 'user@acme.com', logonpwd: 'secret' };

beforeEach(() => {
    logger.warn.mockClear();
});

describe('without --skip-login', () => {
    test('passes when every credential is given', () => {
        expect(() => check({ ...ALL_CLOUD })).not.toThrow();
    });

    test('treats an explicit skipLogin: false the same as an absent one', () => {
        expect(() => check({ ...ALL_CLOUD, skipLogin: false })).not.toThrow();
    });

    test('refuses a missing credential, naming the flag and its variable', () => {
        const { logonpwd: _dropped, ...withoutPassword } = ALL_CLOUD;

        expect(() => check(withoutPassword)).toThrow(TestError);
        expect(() => check(withoutPassword)).toThrow('--logonpwd (BSI_QSCLOUD_CST_LOGON_PWD)');
    });

    test('names every missing credential at once, not the first one only', () => {
        expect(() => check({})).toThrow(
            '--logonuserid (BSI_QSCLOUD_CST_LOGON_USER_ID), --logonpwd (BSI_QSCLOUD_CST_LOGON_PWD)'
        );
    });

    test('points at --skip-login as the alternative', () => {
        expect(() => check({})).toThrow('--skip-login');
    });

    // A bare `BSI_..._LOGON_PWD=` line in a unit file means unset throughout this codebase.
    test.each(['', '   '])('counts a blank value (%j) as missing', (blank) => {
        expect(() => check({ ...ALL_CLOUD, logonpwd: blank })).toThrow('--logonpwd');
    });

    test('never prints a credential value', () => {
        // Asserted on the throw itself: a catch-block assertion passes without running at all if
        // the check ever stops throwing, which is the regression this has to catch.
        const attempt = () => check({ logonuserid: 'user@acme.com' });

        expect(attempt).toThrow('--logonpwd');
        expect(attempt).not.toThrow(/user@acme\.com/);
    });
});

describe('with --skip-login', () => {
    test('passes quietly when no credentials are given', () => {
        expect(() => check({ skipLogin: true })).not.toThrow();
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('counts a blank credential as not given', () => {
        check({ skipLogin: true, logonpwd: '' });

        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('carries on when credentials are given anyway, saying they are ignored', () => {
        expect(() => check({ skipLogin: true, logonuserid: 'user@acme.com' })).not.toThrow();
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn.mock.calls[0][0]).toContain(
            '--logonuserid (BSI_QSCLOUD_CST_LOGON_USER_ID)'
        );
        expect(logger.warn.mock.calls[0][0]).toContain('ignored');
    });

    test('removes them, so nothing downstream can use them by accident', () => {
        const options = { skipLogin: true, logonuserid: 'user@acme.com', logonpwd: 'secret' };

        check(options);

        expect(options).not.toHaveProperty('logonuserid');
        expect(options).not.toHaveProperty('logonpwd');
        expect(options.skipLogin).toBe(true);
    });

    test('never prints the password it ignored', () => {
        check({ skipLogin: true, logonpwd: 'hunter2' });

        expect(logger.warn.mock.calls[0][0]).not.toContain('hunter2');
    });
});
