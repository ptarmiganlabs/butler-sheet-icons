import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import path from 'path';

const statSync = jest.fn();
const readFileSync = jest.fn().mockReturnValue(Buffer.from('png-bytes'));

jest.unstable_mockModule('fs', () => ({
    default: { statSync, readFileSync },
    statSync,
    readFileSync,
}));

const Post = jest.fn().mockResolvedValue({ statusCode: 201 });
const qrsInteract = jest.fn(function QrsInteract() {
    this.Post = Post;
});

jest.unstable_mockModule('qrs-interact', () => ({ default: qrsInteract }));

const setupQseowQrsConnection = jest.fn().mockReturnValue({ hostname: 'sense.example.com' });

jest.unstable_mockModule('../qseow-qrs.js', () => ({ setupQseowQrsConnection }));

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
const { qseowUploadToContentLibrary } = await import('../qseow-upload.js');

const APP_ID = 'test-app-id';

const BASE_OPTIONS = {
    loglevel: 'info',
    contentlibrary: 'BSI thumbnails',
    imagedir: './img',
};

const ICON_FOLDER = path.resolve(`./img/qseow/${APP_ID}`);

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
 * Extracts the API URLs that were POSTed to QRS.
 *
 * @returns {string[]} One URL per upload call, in call order.
 */
const uploadedUrls = () => Post.mock.calls.map((call) => call[0]);

beforeEach(() => {
    jest.clearAllMocks();
    readFileSync.mockReturnValue(Buffer.from('png-bytes'));
    Post.mockResolvedValue({ statusCode: 201 });
});

describe('qseowUploadToContentLibrary', () => {
    test('uploads a thumbnail png', async () => {
        withFiles(['thumbnail-1.png']);

        await qseowUploadToContentLibrary(
            [{ fileNameShort: 'thumbnail-1.png' }],
            APP_ID,
            BASE_OPTIONS
        );

        expect(Post).toHaveBeenCalledTimes(1);
        expect(uploadedUrls()[0]).toContain('externalpath=thumbnail-1.png');
    });

    test('sends the file bytes as image/png', async () => {
        withFiles(['thumbnail-1.png']);

        await qseowUploadToContentLibrary(
            [{ fileNameShort: 'thumbnail-1.png' }],
            APP_ID,
            BASE_OPTIONS
        );

        const [, body, contentType] = Post.mock.calls[0];

        expect(body).toEqual(Buffer.from('png-bytes'));
        expect(contentType).toBe('image/png');
    });

    test('builds the QRS connection from the real options', async () => {
        // Without this, production could call setupQseowQrsConnection({}) — no host, no
        // port, no client cert — and every test here would still pass.
        withFiles(['thumbnail-1.png']);

        await qseowUploadToContentLibrary(
            [{ fileNameShort: 'thumbnail-1.png' }],
            APP_ID,
            BASE_OPTIONS
        );

        expect(setupQseowQrsConnection).toHaveBeenCalledWith(BASE_OPTIONS);
        expect(qrsInteract).toHaveBeenCalledWith({ hostname: 'sense.example.com' });
    });

    test('reads each file from the app-specific image folder', async () => {
        withFiles(['thumbnail-1.png']);

        await qseowUploadToContentLibrary(
            [{ fileNameShort: 'thumbnail-1.png' }],
            APP_ID,
            BASE_OPTIONS
        );

        expect(readFileSync).toHaveBeenCalledWith(path.join(ICON_FOLDER, 'thumbnail-1.png'));
    });

    test('url-encodes a content library name containing spaces', async () => {
        withFiles(['thumbnail-1.png']);

        await qseowUploadToContentLibrary(
            [{ fileNameShort: 'thumbnail-1.png' }],
            APP_ID,
            BASE_OPTIONS
        );

        expect(uploadedUrls()[0]).toContain('/contentlibrary/BSI%20thumbnails/uploadfile');
    });

    test('overwrites existing images rather than failing on them', async () => {
        withFiles(['thumbnail-1.png']);

        await qseowUploadToContentLibrary(
            [{ fileNameShort: 'thumbnail-1.png' }],
            APP_ID,
            BASE_OPTIONS
        );

        expect(uploadedUrls()[0]).toContain('overwrite=true');
    });

    test('uploads every thumbnail in the list', async () => {
        withFiles(['thumbnail-1.png', 'thumbnail-2.png', 'thumbnail-3.png']);

        await qseowUploadToContentLibrary(
            [
                { fileNameShort: 'thumbnail-1.png' },
                { fileNameShort: 'thumbnail-2.png' },
                { fileNameShort: 'thumbnail-3.png' },
            ],
            APP_ID,
            BASE_OPTIONS
        );

        expect(Post).toHaveBeenCalledTimes(3);
    });

    describe('files that must not be uploaded', () => {
        test('skips a png whose name is not a thumbnail', async () => {
            withFiles(['overview-1.png']);

            await qseowUploadToContentLibrary(
                [{ fileNameShort: 'overview-1.png' }],
                APP_ID,
                BASE_OPTIONS
            );

            expect(Post).not.toHaveBeenCalled();
        });

        test('skips a thumbnail that is not a png', async () => {
            withFiles(['thumbnail-1.jpg']);

            await qseowUploadToContentLibrary(
                [{ fileNameShort: 'thumbnail-1.jpg' }],
                APP_ID,
                BASE_OPTIONS
            );

            expect(Post).not.toHaveBeenCalled();
        });

        test('skips directories', async () => {
            withFiles([]);

            await qseowUploadToContentLibrary(
                [{ fileNameShort: 'thumbnail-1.png' }],
                APP_ID,
                BASE_OPTIONS
            );

            expect(Post).not.toHaveBeenCalled();
        });

        test('uploads only the qualifying entries from a mixed list', async () => {
            withFiles(['thumbnail-1.png', 'overview-1.png', 'thumbnail-2.png', 'notes.txt']);

            await qseowUploadToContentLibrary(
                [
                    { fileNameShort: 'thumbnail-1.png' },
                    { fileNameShort: 'overview-1.png' },
                    { fileNameShort: 'thumbnail-2.png' },
                    { fileNameShort: 'notes.txt' },
                ],
                APP_ID,
                BASE_OPTIONS
            );

            expect(Post).toHaveBeenCalledTimes(2);
            expect(uploadedUrls().join('\n')).toContain('thumbnail-1.png');
            expect(uploadedUrls().join('\n')).toContain('thumbnail-2.png');
        });
    });

    describe('error handling', () => {
        test('a failed upload does not stop the remaining files', async () => {
            withFiles(['thumbnail-1.png', 'thumbnail-2.png', 'thumbnail-3.png']);
            Post.mockRejectedValueOnce(new Error('QRS rejected the upload'));

            await qseowUploadToContentLibrary(
                [
                    { fileNameShort: 'thumbnail-1.png' },
                    { fileNameShort: 'thumbnail-2.png' },
                    { fileNameShort: 'thumbnail-3.png' },
                ],
                APP_ID,
                BASE_OPTIONS
            );

            expect(Post).toHaveBeenCalledTimes(3);
        });

        test('logs a failed upload rather than swallowing it silently', async () => {
            withFiles(['thumbnail-1.png']);
            Post.mockRejectedValue(new Error('QRS rejected the upload'));

            await qseowUploadToContentLibrary(
                [{ fileNameShort: 'thumbnail-1.png' }],
                APP_ID,
                BASE_OPTIONS
            );

            expect(logger.error).toHaveBeenCalled();
        });

        test('does not reject when a file cannot be stat-ed', async () => {
            statSync.mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            await expect(
                qseowUploadToContentLibrary(
                    [{ fileNameShort: 'thumbnail-1.png' }],
                    APP_ID,
                    BASE_OPTIONS
                )
            ).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalled();
        });

        test('does not reject when the file list is not iterable', async () => {
            await expect(
                qseowUploadToContentLibrary(undefined, APP_ID, BASE_OPTIONS)
            ).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalled();
        });
    });

    test('accepts an empty file list without contacting QRS', async () => {
        await qseowUploadToContentLibrary([], APP_ID, BASE_OPTIONS);

        expect(Post).not.toHaveBeenCalled();
    });
});
