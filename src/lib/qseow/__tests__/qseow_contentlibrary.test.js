import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const Get = jest.fn();
const qrsInteract = jest.fn(function QrsInteract() {
    this.Get = Get;
});

jest.unstable_mockModule('qrs-interact', () => ({ default: qrsInteract }));

const setupQseowQrsConnection = jest
    .fn()
    .mockReturnValue({ hostname: 'sense.example.com', portnumber: 4242 });

jest.unstable_mockModule('../qseow-qrs.js', () => ({ setupQseowQrsConnection }));

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
const { qseowVerifyContentLibraryExists } = await import('../qseow-contentlibrary.js');

const OPTIONS = { contentlibrary: 'BSI thumbnails' };

beforeEach(() => {
    jest.clearAllMocks();
    setupQseowQrsConnection.mockReturnValue({ hostname: 'sense.example.com', portnumber: 4242 });
});

describe('qseowVerifyContentLibraryExists', () => {
    test('returns true when QRS reports a matching library', async () => {
        Get.mockResolvedValue({ statusCode: 200, body: [{ name: 'BSI thumbnails' }] });

        await expect(qseowVerifyContentLibraryExists(OPTIONS)).resolves.toBe(true);
    });

    test('returns false when QRS reports no match', async () => {
        Get.mockResolvedValue({ statusCode: 200, body: [] });

        await expect(qseowVerifyContentLibraryExists(OPTIONS)).resolves.toBe(false);
    });

    test('returns false on a non-200 response, even with a populated body', async () => {
        Get.mockResolvedValue({ statusCode: 403, body: [{ name: 'BSI thumbnails' }] });

        await expect(qseowVerifyContentLibraryExists(OPTIONS)).resolves.toBe(false);
    });

    test('filters QRS by the content library name', async () => {
        Get.mockResolvedValue({ statusCode: 200, body: [{ name: 'BSI thumbnails' }] });

        await qseowVerifyContentLibraryExists(OPTIONS);

        expect(Get).toHaveBeenCalledWith("/contentlibrary?filter=name eq 'BSI thumbnails'");
    });

    test('builds the QRS connection from the supplied options', async () => {
        Get.mockResolvedValue({ statusCode: 200, body: [] });

        await qseowVerifyContentLibraryExists(OPTIONS);

        expect(setupQseowQrsConnection).toHaveBeenCalledWith(OPTIONS);
        expect(qrsInteract).toHaveBeenCalledWith({
            hostname: 'sense.example.com',
            portnumber: 4242,
        });
    });

    test('rejects when the QRS call fails', async () => {
        Get.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(qseowVerifyContentLibraryExists(OPTIONS)).rejects.toThrow(/CONTENT LIBRARY 1/);
    });

    test('keeps the underlying failure as the error cause', async () => {
        const qrsError = new Error('ECONNREFUSED');
        Get.mockRejectedValue(qrsError);

        let thrown;
        try {
            await qseowVerifyContentLibraryExists(OPTIONS);
        } catch (err) {
            thrown = err;
        }

        expect(thrown.cause).toBe(qrsError);
    });

    test('logs the failure before rethrowing', async () => {
        Get.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(qseowVerifyContentLibraryExists(OPTIONS)).rejects.toThrow();

        expect(logger.error).toHaveBeenCalled();
    });

    test('rejects when the response has no body to inspect', async () => {
        Get.mockResolvedValue({ statusCode: 200 });

        await expect(qseowVerifyContentLibraryExists(OPTIONS)).rejects.toThrow(/CONTENT LIBRARY 1/);
    });
});
