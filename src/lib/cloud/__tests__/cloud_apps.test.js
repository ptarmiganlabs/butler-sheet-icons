import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    bsiExecutablePath: '/test/path',
    isSea: false,
}));

const Get = jest.fn();
const saasInstance = { Get };

const { logger } = await import('../../../globals.js');
const { getAppIdsByCollection } = await import('../cloud-apps.js');

const COLLECTION_ID = 'collection-1';

/**
 * Points the mocked `Get` at a tenant with one collection holding the given items.
 *
 * @param {Array<object>} items - Items the collection should report.
 *
 * @returns {void}
 */
const withCollectionItems = (items) => {
    Get.mockImplementation(async (path) => {
        if (path === 'collections') return [{ id: COLLECTION_ID }];
        if (path === `collections/${COLLECTION_ID}/items`) return items;
        return [];
    });
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('getAppIdsByCollection', () => {
    describe('happy path', () => {
        test('returns id and name for every app in the collection', async () => {
            withCollectionItems([
                {
                    id: 'item-a',
                    resourceType: 'app',
                    resourceAttributes: { id: 'app-a', name: 'Alpha' },
                },
                {
                    id: 'item-b',
                    resourceType: 'app',
                    resourceAttributes: { id: 'app-b', name: 'Beta' },
                },
            ]);

            const apps = await getAppIdsByCollection(saasInstance, COLLECTION_ID);

            expect(apps).toEqual([
                { id: 'app-a', name: 'Alpha' },
                { id: 'app-b', name: 'Beta' },
            ]);
        });

        test('fetches collections and then collection items, in that order', async () => {
            withCollectionItems([]);

            await getAppIdsByCollection(saasInstance, COLLECTION_ID);

            expect(Get).toHaveBeenCalledTimes(2);
            expect(Get.mock.calls[0][0]).toBe('collections');
            expect(Get.mock.calls[1][0]).toBe(`collections/${COLLECTION_ID}/items`);
        });

        test('returns an empty array for a collection with no apps', async () => {
            withCollectionItems([]);

            const apps = await getAppIdsByCollection(saasInstance, COLLECTION_ID);

            expect(apps).toEqual([]);
        });
    });

    describe('non-app items', () => {
        test('skips collection items that are not apps', async () => {
            withCollectionItems([
                {
                    id: 'item-a',
                    resourceType: 'app',
                    resourceAttributes: { id: 'app-a', name: 'Alpha' },
                },
                { id: 'item-ds', resourceType: 'dataset' },
                {
                    id: 'item-b',
                    resourceType: 'app',
                    resourceAttributes: { id: 'app-b', name: 'Beta' },
                },
            ]);

            const apps = await getAppIdsByCollection(saasInstance, COLLECTION_ID);

            expect(apps).toEqual([
                { id: 'app-a', name: 'Alpha' },
                { id: 'app-b', name: 'Beta' },
            ]);
        });

        test('logs a verbose line for each skipped non-app item', async () => {
            withCollectionItems([{ id: 'item-ds', resourceType: 'dataset' }]);

            await getAppIdsByCollection(saasInstance, COLLECTION_ID);

            const verbose = logger.verbose.mock.calls.map((c) => String(c[0])).join('\n');
            expect(verbose).toContain('item-ds');
            expect(verbose).toContain('dataset');
        });

        test('a collection with only non-app items returns an empty array', async () => {
            withCollectionItems([
                { id: 'ds-1', resourceType: 'dataset' },
                { id: 'ds-2', resourceType: 'dataset' },
            ]);

            const apps = await getAppIdsByCollection(saasInstance, COLLECTION_ID);

            expect(apps).toEqual([]);
        });
    });

    describe('name fallback', () => {
        test('falls back to id when resourceAttributes.name is absent', async () => {
            withCollectionItems([
                { id: 'item-a', resourceType: 'app', resourceAttributes: { id: 'app-a' } },
            ]);

            const apps = await getAppIdsByCollection(saasInstance, COLLECTION_ID);

            expect(apps).toEqual([{ id: 'app-a', name: 'app-a' }]);
        });

        test('falls back to id when resourceAttributes.name is null', async () => {
            withCollectionItems([
                {
                    id: 'item-a',
                    resourceType: 'app',
                    resourceAttributes: { id: 'app-a', name: null },
                },
            ]);

            const apps = await getAppIdsByCollection(saasInstance, COLLECTION_ID);

            expect(apps).toEqual([{ id: 'app-a', name: 'app-a' }]);
        });
    });

    describe('collection not found', () => {
        test('throws when the collection does not exist on the tenant', async () => {
            Get.mockResolvedValue([{ id: 'some-other-collection' }]);

            await expect(getAppIdsByCollection(saasInstance, COLLECTION_ID)).rejects.toThrow(
                /does not exist/
            );
        });

        test('the error message names the requested collection', async () => {
            Get.mockResolvedValue([{ id: 'some-other-collection' }]);

            await expect(getAppIdsByCollection(saasInstance, COLLECTION_ID)).rejects.toThrow(
                COLLECTION_ID
            );
        });

        test('does not fetch items when the collection is missing', async () => {
            Get.mockResolvedValue([{ id: 'some-other-collection' }]);

            await expect(getAppIdsByCollection(saasInstance, COLLECTION_ID)).rejects.toThrow();

            expect(Get).toHaveBeenCalledTimes(1);
            expect(Get).toHaveBeenCalledWith('collections');
        });

        test('throws when the tenant has no collections at all', async () => {
            Get.mockResolvedValue([]);

            await expect(getAppIdsByCollection(saasInstance, COLLECTION_ID)).rejects.toThrow(
                /does not exist/
            );
        });
    });

    describe('error propagation', () => {
        test('propagates errors from the collections call', async () => {
            Get.mockRejectedValue(new Error('401 Unauthorized'));

            await expect(getAppIdsByCollection(saasInstance, COLLECTION_ID)).rejects.toThrow(
                '401 Unauthorized'
            );
        });

        test('propagates errors from the items call', async () => {
            Get.mockImplementation(async (path) => {
                if (path === 'collections') return [{ id: COLLECTION_ID }];
                throw new Error('500 Internal Server Error');
            });

            await expect(getAppIdsByCollection(saasInstance, COLLECTION_ID)).rejects.toThrow(
                '500 Internal Server Error'
            );
        });
    });
});
