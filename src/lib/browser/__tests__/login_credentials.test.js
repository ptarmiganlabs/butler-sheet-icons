import { jest, describe, test, expect, beforeEach } from '@jest/globals';

import {
    checkLoginCredentials,
    describeCredentials,
    suppliedCredentials,
    QSEOW_LOGON_CREDENTIALS,
    CLOUD_LOGON_CREDENTIALS,
} from '../login-credentials.js';

/** Stands in for QseowError / CloudError, so the tests can assert the platform class is used. */
class TestError extends Error {}

const logger = { warn: jest.fn() };

/**
 * Runs the check with defaults for everything a test does not care about.
 *
 * @param {object} options - The options bag under test.
 * @param {object} [overrides] - Fields to merge over the defaults.
 *
 * @returns {void}
 */
const check = (options, overrides = {}) =>
    checkLoginCredentials(options, {
        credentials: QSEOW_LOGON_CREDENTIALS,
        onConflict: 'reject',
        logPrefix: 'QSEOW',
        ErrorClass: TestError,
        logger,
        ...overrides,
    });

const ALL_QSEOW = { logonuserdir: 'ACME', logonuserid: 'goran', logonpwd: 'secret' };

beforeEach(() => {
    logger.warn.mockClear();
});

describe('without --skip-login', () => {
    test('passes when every credential is given', () => {
        expect(() => check({ ...ALL_QSEOW })).not.toThrow();
    });

    test('treats an explicit skipLogin: false the same as an absent one', () => {
        expect(() => check({ ...ALL_QSEOW, skipLogin: false })).not.toThrow();
    });

    test('refuses a missing credential, naming the flag and its variable', () => {
        const { logonpwd: _dropped, ...withoutPassword } = ALL_QSEOW;

        expect(() => check(withoutPassword)).toThrow(TestError);
        expect(() => check(withoutPassword)).toThrow('--logonpwd (BSI_QSEOW_CST_LOGON_PWD)');
    });

    test('names every missing credential at once, not the first one only', () => {
        let message = '';
        try {
            check({});
        } catch (err) {
            message = err.message;
        }

        for (const { flag, envVar } of QSEOW_LOGON_CREDENTIALS) {
            expect(message).toContain(`${flag} (${envVar})`);
        }
    });

    test('points at --skip-login as the alternative', () => {
        expect(() => check({})).toThrow('--skip-login');
    });

    // A bare `BSI_..._LOGON_PWD=` line in a unit file means unset throughout this codebase.
    test.each(['', '   '])('counts a blank value (%j) as missing', (blank) => {
        expect(() => check({ ...ALL_QSEOW, logonpwd: blank })).toThrow('--logonpwd');
    });

    test('never prints a credential value', () => {
        // Asserted on the throw itself: a catch-block assertion passes without running at all if
        // the check ever stops throwing, which is the regression this has to catch.
        const attempt = () => check({ logonuserdir: 'ACME', logonuserid: 'goran' });

        expect(attempt).toThrow('--logonpwd');
        expect(attempt).not.toThrow(/ACME|goran/);
    });
});

describe('with --skip-login and no credentials', () => {
    test.each(['reject', 'warn'])('passes quietly when %s is the conflict rule', (onConflict) => {
        expect(() => check({ skipLogin: true }, { onConflict })).not.toThrow();
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('counts a blank credential as not given', () => {
        expect(() => check({ skipLogin: true, logonpwd: '' })).not.toThrow();
    });
});

describe('with --skip-login and credentials as well', () => {
    describe("'reject' (QSEoW)", () => {
        test('refuses the run, naming each credential and its variable', () => {
            const options = { skipLogin: true, logonuserid: 'goran', logonpwd: 'secret' };

            expect(() => check(options)).toThrow(TestError);
            expect(() => check(options)).toThrow(
                '--logonuserid (BSI_QSEOW_CST_LOGON_USER_ID), --logonpwd (BSI_QSEOW_CST_LOGON_PWD)'
            );
        });

        test('says to look in the environment, where a stray value most likely is', () => {
            expect(() => check({ skipLogin: true, logonpwd: 'secret' })).toThrow('environment');
        });

        test('never prints the password it refused', () => {
            expect(() => check({ skipLogin: true, logonpwd: 'hunter2' })).not.toThrow('hunter2');
        });
    });

    describe("'warn' (Cloud)", () => {
        const warnCheck = (options) =>
            check(options, {
                credentials: CLOUD_LOGON_CREDENTIALS,
                onConflict: 'warn',
                logPrefix: 'CLOUD',
            });

        test('carries on, saying the credentials are ignored', () => {
            expect(() => warnCheck({ skipLogin: true, logonuserid: 'goran' })).not.toThrow();
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn.mock.calls[0][0]).toContain(
                '--logonuserid (BSI_QSCLOUD_CST_LOGON_USER_ID)'
            );
            expect(logger.warn.mock.calls[0][0]).toContain('ignored');
        });

        test('removes them, so nothing downstream can use them by accident', () => {
            const options = { skipLogin: true, logonuserid: 'goran', logonpwd: 'secret' };

            warnCheck(options);

            expect(options).not.toHaveProperty('logonuserid');
            expect(options).not.toHaveProperty('logonpwd');
            expect(options.skipLogin).toBe(true);
        });

        test('never prints the password it ignored', () => {
            warnCheck({ skipLogin: true, logonpwd: 'hunter2' });

            expect(logger.warn.mock.calls[0][0]).not.toContain('hunter2');
        });
    });
});

describe('the helpers the QSEoW wizard shares with the worker', () => {
    test('suppliedCredentials keeps the given ones, in list order, and skips blanks', () => {
        const given = suppliedCredentials(
            { logonpwd: 'secret', logonuserdir: 'ACME', logonuserid: '  ' },
            QSEOW_LOGON_CREDENTIALS
        );

        expect(given.map(({ key }) => key)).toEqual(['logonuserdir', 'logonpwd']);
    });

    test('describeCredentials names each flag with its variable', () => {
        expect(describeCredentials(CLOUD_LOGON_CREDENTIALS)).toBe(
            '--logonuserid (BSI_QSCLOUD_CST_LOGON_USER_ID), --logonpwd (BSI_QSCLOUD_CST_LOGON_PWD)'
        );
    });
});
