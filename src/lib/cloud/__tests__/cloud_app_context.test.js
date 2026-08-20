import { jest, describe, test, expect } from '@jest/globals';

import { readCloudAppContext } from '../cloud-app-context.js';

const APP_ID = 'test-app-id';

/**
 * Builds a saas stub returning the given app metadata.
 *
 * @param {object} attributes - The app's `attributes` object.
 *
 * @returns {object} A saas-shaped object with `Get`.
 */
const createSaas = (attributes) => ({
    Get: jest.fn().mockResolvedValue({ attributes }),
});

describe('readCloudAppContext', () => {
    test('reads the app from the apps endpoint', async () => {
        const saasInstance = createSaas({ name: 'Test App' });

        await readCloudAppContext(APP_ID, saasInstance);

        expect(saasInstance.Get).toHaveBeenCalledWith('apps/test-app-id');
    });

    test('returns the metadata it read', async () => {
        const saasInstance = createSaas({ name: 'Test App', publishTime: null });

        const { appMetadata } = await readCloudAppContext(APP_ID, saasInstance);

        expect(appMetadata.attributes.name).toBe('Test App');
    });

    test('reports an app with a publish time as published', async () => {
        const saasInstance = createSaas({ publishTime: '2021-09-01T12:34:56.789Z' });

        const { appIsPublished } = await readCloudAppContext(APP_ID, saasInstance);

        expect(appIsPublished).toBe(true);
    });

    test('reports an app with no publish time as unpublished', async () => {
        const saasInstance = createSaas({ publishTime: null });

        const { appIsPublished } = await readCloudAppContext(APP_ID, saasInstance);

        expect(appIsPublished).toBe(false);
    });

    test('reports an empty publish time as unpublished', async () => {
        // The field is a string, and Qlik returns '' rather than null in some responses.
        const saasInstance = createSaas({ publishTime: '' });

        const { appIsPublished } = await readCloudAppContext(APP_ID, saasInstance);

        expect(appIsPublished).toBe(false);
    });
});
