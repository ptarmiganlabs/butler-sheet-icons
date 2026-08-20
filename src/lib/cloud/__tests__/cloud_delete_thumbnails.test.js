import { jest, describe, test, expect, beforeEach } from '@jest/globals';

import {
    deleteCloudAppThumbnail,
    clearExistingCloudThumbnails,
} from '../cloud-delete-thumbnails.js';

const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
};

const APP_ID = 'test-app-id';
const THUMBNAIL = { name: 'thumbnail-1.png', type: 'image' };

beforeEach(() => {
    jest.clearAllMocks();
});

describe('deleteCloudAppThumbnail', () => {
    test('deletes the thumbnail from the app media library', async () => {
        const saasInstance = { Delete: jest.fn().mockResolvedValue({ statusCode: 204 }) };

        await deleteCloudAppThumbnail(THUMBNAIL, APP_ID, saasInstance, mockLogger);

        expect(saasInstance.Delete).toHaveBeenCalledWith(
            'apps/test-app-id/media/files/thumbnails/thumbnail-1.png'
        );
    });

    test('resolves without a value on success', async () => {
        const saasInstance = { Delete: jest.fn().mockResolvedValue({ statusCode: 204 }) };

        await expect(
            deleteCloudAppThumbnail(THUMBNAIL, APP_ID, saasInstance, mockLogger)
        ).resolves.toBeUndefined();
    });

    test('builds the path from the thumbnail name it is given', async () => {
        const saasInstance = { Delete: jest.fn().mockResolvedValue({}) };

        await deleteCloudAppThumbnail(
            { name: 'thumbnail-7-blurred.png' },
            'other-app',
            saasInstance,
            mockLogger
        );

        expect(saasInstance.Delete).toHaveBeenCalledWith(
            'apps/other-app/media/files/thumbnails/thumbnail-7-blurred.png'
        );
    });

    test('rejects when the delete fails', async () => {
        const saasInstance = { Delete: jest.fn().mockRejectedValue(new Error('403 Forbidden')) };

        await expect(
            deleteCloudAppThumbnail(THUMBNAIL, APP_ID, saasInstance, mockLogger)
        ).rejects.toThrow('Error deleting existing thumbnail');
    });

    test('keeps the API failure as the error cause', async () => {
        const apiError = new Error('403 Forbidden');
        const saasInstance = { Delete: jest.fn().mockRejectedValue(apiError) };

        let thrown;
        try {
            await deleteCloudAppThumbnail(THUMBNAIL, APP_ID, saasInstance, mockLogger);
        } catch (err) {
            thrown = err;
        }

        expect(thrown.cause).toBe(apiError);
    });

    test('logs the failure before rethrowing', async () => {
        const saasInstance = { Delete: jest.fn().mockRejectedValue(new Error('403 Forbidden')) };

        await expect(
            deleteCloudAppThumbnail(THUMBNAIL, APP_ID, saasInstance, mockLogger)
        ).rejects.toThrow();

        expect(mockLogger.error).toHaveBeenCalled();
    });
});

describe('clearExistingCloudThumbnails', () => {
    /**
     * Builds a saas stub whose media library contains the given entries.
     *
     * @param {object} [opts] - Stub behaviour.
     * @param {Array} [opts.mediaList] - What `media/list` returns.
     * @param {Array} [opts.thumbnails] - What `media/list/thumbnails` returns.
     *
     * @returns {object} A saas-shaped object with `Get` and `Delete`.
     */
    const createSaas = ({ mediaList = [], thumbnails = [] } = {}) => ({
        Get: jest.fn((path) =>
            Promise.resolve(path.endsWith('/thumbnails') ? thumbnails : mediaList)
        ),
        Delete: jest.fn().mockResolvedValue({ statusCode: 204 }),
    });

    const THUMBNAIL_FOLDER = { type: 'directory', name: 'thumbnails' };

    test('does nothing when the app has no thumbnails folder', async () => {
        const saasInstance = createSaas({ mediaList: [{ type: 'directory', name: 'other' }] });

        await clearExistingCloudThumbnails(APP_ID, saasInstance, mockLogger);

        expect(saasInstance.Get).toHaveBeenCalledTimes(1);
        expect(saasInstance.Delete).not.toHaveBeenCalled();
    });

    test('deletes every image in the thumbnails folder', async () => {
        const saasInstance = createSaas({
            mediaList: [THUMBNAIL_FOLDER],
            thumbnails: [
                { type: 'image', name: 'thumbnail-1.png' },
                { type: 'image', name: 'thumbnail-2.png' },
            ],
        });

        await clearExistingCloudThumbnails(APP_ID, saasInstance, mockLogger);

        expect(saasInstance.Delete).toHaveBeenCalledTimes(2);
    });

    test('leaves entries that are not images alone', async () => {
        const saasInstance = createSaas({
            mediaList: [THUMBNAIL_FOLDER],
            thumbnails: [
                { type: 'image', name: 'thumbnail-1.png' },
                { type: 'directory', name: 'nested' },
            ],
        });

        await clearExistingCloudThumbnails(APP_ID, saasInstance, mockLogger);

        expect(saasInstance.Delete).toHaveBeenCalledTimes(1);
    });

    test('throws when the existing thumbnails cannot be listed', async () => {
        // Capturing over an app whose old images are in an unknown state is worse than stopping.
        const saasInstance = createSaas({ mediaList: [THUMBNAIL_FOLDER] });
        saasInstance.Get.mockImplementation((path) =>
            path.endsWith('/thumbnails')
                ? Promise.reject(new Error('403 Forbidden'))
                : Promise.resolve([THUMBNAIL_FOLDER])
        );

        await expect(
            clearExistingCloudThumbnails(APP_ID, saasInstance, mockLogger)
        ).rejects.toThrow('Error getting existing thumbnails');
        expect(saasInstance.Delete).not.toHaveBeenCalled();
    });
});
