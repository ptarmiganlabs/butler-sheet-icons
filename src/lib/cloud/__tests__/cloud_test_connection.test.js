import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
}));

const { logger } = await import('../../../globals.js');
const { qscloudTestConnection } = await import('../cloud-test-connection.js');

const OPTIONS = { tenanturl: 'tenant.eu.qlikcloud.com', apikey: 'api-key', loglevel: 'info' };

const USER = {
    tenantId: 'tenant-123',
    name: 'Test User',
    email: 'test@example.com',
    id: 'user-456',
};

/**
 * Builds a SaaS client stub whose `Get` resolves to the supplied payload.
 *
 * @param {object|undefined} response - Value `Get` should resolve to.
 *
 * @returns {object} A stub exposing a mocked `Get`.
 */
const saasReturning = (response) => ({ Get: jest.fn().mockResolvedValue(response) });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('qscloudTestConnection', () => {
    test('resolves true when the API key identifies a user', async () => {
        await expect(qscloudTestConnection(OPTIONS, saasReturning(USER))).resolves.toBe(true);
    });

    test('asks the API who the key belongs to', async () => {
        const saasInstance = saasReturning(USER);

        await qscloudTestConnection(OPTIONS, saasInstance);

        expect(saasInstance.Get).toHaveBeenCalledWith('users/me');
    });

    test('reports the tenant and user back to the operator', async () => {
        await qscloudTestConnection(OPTIONS, saasReturning(USER));

        const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');

        expect(info).toContain('tenant-123');
        expect(info).toContain('Test User');
        expect(info).toContain('test@example.com');
        expect(info).toContain('user-456');
    });

    test('names the tenant that was reached', async () => {
        await qscloudTestConnection(OPTIONS, saasReturning(USER));

        const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');

        expect(info).toContain('tenant.eu.qlikcloud.com');
    });

    test('tolerates a response missing the user fields', async () => {
        await expect(qscloudTestConnection(OPTIONS, saasReturning({}))).resolves.toBe(true);
    });

    test('tolerates a response of undefined', async () => {
        await expect(qscloudTestConnection(OPTIONS, saasReturning(undefined))).resolves.toBe(true);
    });

    test('rejects when the API call fails', async () => {
        const apiError = new Error('401 Unauthorized');
        const saasInstance = { Get: jest.fn().mockRejectedValue(apiError) };

        await expect(qscloudTestConnection(OPTIONS, saasInstance)).rejects.toThrow(
            '401 Unauthorized'
        );
    });

    test('passes the original error through untouched, so the caller can read its status', async () => {
        const apiError = Object.assign(new Error('401 Unauthorized'), {
            status: 401,
            statusText: 'Unauthorized',
        });
        const saasInstance = { Get: jest.fn().mockRejectedValue(apiError) };

        await expect(qscloudTestConnection(OPTIONS, saasInstance)).rejects.toBe(apiError);
    });
});
