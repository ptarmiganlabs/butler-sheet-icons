import { jest, describe, test, expect, beforeEach } from '@jest/globals';

import { deleteCloudAppThumbnail } from '../cloud-delete-thumbnails.js';

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
