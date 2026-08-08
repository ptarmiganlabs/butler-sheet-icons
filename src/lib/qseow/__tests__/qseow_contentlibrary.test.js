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

        // Assert on the decoded filter, i.e. what QRS parses. The path goes out URL-encoded,
        // so pinning the raw string here would just pin the encoding.
        expect(decodeURIComponent(Get.mock.calls[0][0])).toBe(
            "/contentlibrary?filter=(name eq 'BSI thumbnails')"
        );
    });

    test('a content library name containing an ampersand survives the query string', async () => {
        // Unencoded, the `&` starts a new query parameter and QRS answers
        // 400::Missing parameter value(s) - verified against a live QSEoW.
        Get.mockResolvedValue({ statusCode: 200, body: [{ name: 'R&D thumbnails' }] });

        await qseowVerifyContentLibraryExists({ ...OPTIONS, contentlibrary: 'R&D thumbnails' });

        const [path] = Get.mock.calls[0];
        expect(path).toContain('%26');
        expect(decodeURIComponent(path)).toBe("/contentlibrary?filter=(name eq 'R&D thumbnails')");
    });

    test('a content library name containing a quote is backslash-escaped for QRS', async () => {
        Get.mockResolvedValue({ statusCode: 200, body: [] });

        await qseowVerifyContentLibraryExists({ ...OPTIONS, contentlibrary: "Q1'25" });

        expect(decodeURIComponent(Get.mock.calls[0][0])).toBe(
            "/contentlibrary?filter=(name eq 'Q1\\'25')"
        );
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
