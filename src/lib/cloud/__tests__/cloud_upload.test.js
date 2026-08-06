import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import path from 'path';

const statSync = jest.fn();
// Bytes derived from the path, so an upload that reads the wrong file is detectable.
// A constant buffer here would let the blurred upload silently ship the unblurred image.
const readFileSync = jest.fn((filePath) => Buffer.from(`bytes-of:${path.basename(filePath)}`));

jest.unstable_mockModule('fs', () => ({
    default: { statSync, readFileSync },
    statSync,
    readFileSync,
}));

const Put = jest.fn().mockResolvedValue({ statusCode: 201 });
const QlikSaas = jest.fn(function QlikSaasMock() {
    this.Put = Put;
});

jest.unstable_mockModule('../cloud-repo.js', () => ({ default: QlikSaas }));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        silly: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
}));

const { logger } = await import('../../../globals.js');
const { qscloudUploadToApp } = await import('../cloud-upload.js');

const APP_ID = 'test-app-id';

const BASE_OPTIONS = {
    loglevel: 'info',
    tenanturl: 'tenant.eu.qlikcloud.com',
    apikey: 'api-key',
    imagedir: './img',
};

const ICON_FOLDER = path.resolve(`./img/cloud/${APP_ID}`);

/**
 * Marks the given short file names as regular files and everything else as a directory.
 *
 * @param {string[]} fileNames - Short file names that should report `isFile() === true`.
 *
 * @returns {void}
 */
const withFiles = (fileNames) => {
    statSync.mockImplementation((fullPath) => {
        const isFile = fileNames.includes(path.basename(fullPath));
        return { isFile: () => isFile, isDirectory: () => !isFile };
    });
};

/**
 * Extracts the media paths that were PUT to the tenant.
 *
 * @returns {string[]} One path per upload call, in call order.
 */
const uploadedPaths = () => Put.mock.calls.map((call) => call[0].path);

beforeEach(() => {
    jest.clearAllMocks();
    readFileSync.mockImplementation((filePath) =>
        Buffer.from(`bytes-of:${path.basename(filePath)}`)
    );
    Put.mockResolvedValue({ statusCode: 201 });
});

describe('qscloudUploadToApp', () => {
    test('uploads a thumbnail to the app media library', async () => {
        withFiles(['thumbnail-1.png']);

        await qscloudUploadToApp([{ fileNameShort: 'thumbnail-1.png' }], APP_ID, BASE_OPTIONS);

        expect(uploadedPaths()).toEqual([
            'apps/test-app-id/media/files/thumbnails/thumbnail-1.png',
        ]);
    });

    test('sends the file bytes as an octet stream', async () => {
        withFiles(['thumbnail-1.png']);

        await qscloudUploadToApp([{ fileNameShort: 'thumbnail-1.png' }], APP_ID, BASE_OPTIONS);

        expect(Put.mock.calls[0][0]).toMatchObject({
            data: Buffer.from('bytes-of:thumbnail-1.png'),
            contentType: 'application/octet-stream',
        });
    });

    test('reads each file from the app-specific image folder', async () => {
        withFiles(['thumbnail-1.png']);

        await qscloudUploadToApp([{ fileNameShort: 'thumbnail-1.png' }], APP_ID, BASE_OPTIONS);

        expect(readFileSync).toHaveBeenCalledWith(path.join(ICON_FOLDER, 'thumbnail-1.png'));
    });

    test('builds the SaaS client from the tenant URL and API key', async () => {
        withFiles(['thumbnail-1.png']);

        await qscloudUploadToApp([{ fileNameShort: 'thumbnail-1.png' }], APP_ID, BASE_OPTIONS);

        expect(QlikSaas).toHaveBeenCalledWith({
            url: 'tenant.eu.qlikcloud.com',
            token: 'api-key',
        });
    });

    describe('blurred variants', () => {
        test('uploads the blurred image alongside the regular one', async () => {
            withFiles(['thumbnail-1.png', 'thumbnail-1-blurred.png']);

            await qscloudUploadToApp(
                [
                    {
                        fileNameShort: 'thumbnail-1.png',
                        fileNameShortBlurred: 'thumbnail-1-blurred.png',
                    },
                ],
                APP_ID,
                BASE_OPTIONS
            );

            expect(uploadedPaths()).toEqual([
                'apps/test-app-id/media/files/thumbnails/thumbnail-1.png',
                'apps/test-app-id/media/files/thumbnails/thumbnail-1-blurred.png',
            ]);
        });

        test('the blurred upload carries the blurred file, not the original', async () => {
            // Without this the blurred slot can be filled with the unredacted screenshot
            // and every --blur-sheet-* flag is silently defeated.
            withFiles(['thumbnail-1.png', 'thumbnail-1-blurred.png']);

            await qscloudUploadToApp(
                [
                    {
                        fileNameShort: 'thumbnail-1.png',
                        fileNameShortBlurred: 'thumbnail-1-blurred.png',
                    },
                ],
                APP_ID,
                BASE_OPTIONS
            );

            expect(readFileSync).toHaveBeenCalledWith(
                path.join(ICON_FOLDER, 'thumbnail-1-blurred.png')
            );
            expect(Put.mock.calls[1][0].data).toEqual(
                Buffer.from('bytes-of:thumbnail-1-blurred.png')
            );
        });

        test('uploads only the regular image when no blurred variant exists', async () => {
            withFiles(['thumbnail-1.png']);

            await qscloudUploadToApp([{ fileNameShort: 'thumbnail-1.png' }], APP_ID, BASE_OPTIONS);

            expect(Put).toHaveBeenCalledTimes(1);
        });
    });

    describe('files that must not be uploaded', () => {
        test('skips a png whose name is not a thumbnail', async () => {
            withFiles(['overview-1.png']);

            await qscloudUploadToApp([{ fileNameShort: 'overview-1.png' }], APP_ID, BASE_OPTIONS);

            expect(Put).not.toHaveBeenCalled();
        });

        test('skips a thumbnail that is not a png', async () => {
            withFiles(['thumbnail-1.jpg']);

            await qscloudUploadToApp([{ fileNameShort: 'thumbnail-1.jpg' }], APP_ID, BASE_OPTIONS);

            expect(Put).not.toHaveBeenCalled();
        });

        test('skips directories', async () => {
            withFiles([]);

            await qscloudUploadToApp([{ fileNameShort: 'thumbnail-1.png' }], APP_ID, BASE_OPTIONS);

            expect(Put).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        test('a failed upload does not stop the remaining files', async () => {
            withFiles(['thumbnail-1.png', 'thumbnail-2.png']);
            Put.mockRejectedValueOnce(new Error('413 Payload Too Large'));

            await qscloudUploadToApp(
                [{ fileNameShort: 'thumbnail-1.png' }, { fileNameShort: 'thumbnail-2.png' }],
                APP_ID,
                BASE_OPTIONS
            );

            expect(Put).toHaveBeenCalledTimes(2);
        });

        test('logs a failed upload rather than swallowing it silently', async () => {
            withFiles(['thumbnail-1.png']);
            Put.mockRejectedValue(new Error('413 Payload Too Large'));

            await qscloudUploadToApp([{ fileNameShort: 'thumbnail-1.png' }], APP_ID, BASE_OPTIONS);

            expect(logger.error).toHaveBeenCalled();
        });

        test('does not reject when a file cannot be stat-ed', async () => {
            statSync.mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            await expect(
                qscloudUploadToApp([{ fileNameShort: 'thumbnail-1.png' }], APP_ID, BASE_OPTIONS)
            ).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalled();
        });

        test('does not reject when the file list is not iterable', async () => {
            await expect(
                qscloudUploadToApp(undefined, APP_ID, BASE_OPTIONS)
            ).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalled();
        });
    });

    test('accepts an empty file list without contacting the tenant', async () => {
        await qscloudUploadToApp([], APP_ID, BASE_OPTIONS);

        expect(Put).not.toHaveBeenCalled();
    });
});
