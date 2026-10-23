import { describe, expect, jest, test } from '@jest/globals';

const userInfo = jest.fn(() => ({ username: 'svc-bsi' }));
jest.unstable_mockModule('node:os', () => ({ default: { userInfo } }));

const { currentAccount } = await import('../os-account.js');

describe('currentAccount', () => {
    test('is the bare user name by default, as the doctor reports it', () => {
        expect(currentAccount({ platform: 'win32', env: { USERDOMAIN: 'ACME' } })).toBe('svc-bsi');
    });

    test('prefixes the Windows domain when asked, on Windows', () => {
        // os.userInfo() has no field for it, and it is what tells ACME\\svc-bsi from a local
        // account of the same name.
        expect(
            currentAccount({ withDomain: true, platform: 'win32', env: { USERDOMAIN: 'ACME' } })
        ).toBe('ACME\\svc-bsi');
    });

    test('ignores USERDOMAIN anywhere but Windows', () => {
        expect(
            currentAccount({ withDomain: true, platform: 'linux', env: { USERDOMAIN: 'ACME' } })
        ).toBe('svc-bsi');
    });

    test('stays the bare name when Windows reports no domain', () => {
        expect(currentAccount({ withDomain: true, platform: 'win32', env: {} })).toBe('svc-bsi');
    });

    test('says unknown rather than failing when the account cannot be read', () => {
        // os.userInfo() throws for a uid with no passwd entry, as in slim containers.
        userInfo.mockImplementationOnce(() => {
            throw new Error('ENOENT');
        });

        expect(
            currentAccount({ withDomain: true, platform: 'win32', env: { USERDOMAIN: 'ACME' } })
        ).toBe('unknown');
    });
});
