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
const { getAppIdsByCollection, listCollections, listApps } = await import('../cloud-apps.js');

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

describe('listCollections', () => {
    test('returns the collections the tenant reported', async () => {
        const collections = [
            { id: 'collection-1', name: 'Finance', description: 'Reports', itemCount: 4 },
            { id: 'collection-2', name: 'Sales', description: undefined, itemCount: 0 },
        ];
        Get.mockResolvedValue(collections);

        await expect(listCollections(saasInstance)).resolves.toEqual(collections);
    });

    test('passes the API response through untouched', async () => {
        // Deliberately not narrowed or normalised. The list-collections command
        // renders seven fields in a table and prints these objects verbatim for
        // --outputformat json, so reshaping here would change output that has
        // always looked this way.
        const collections = [
            {
                id: 'collection-1',
                name: 'Finance',
                itemCount: 4,
                type: 'private',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-02T00:00:00Z',
            },
        ];
        Get.mockResolvedValue(collections);

        const [collection] = await listCollections(saasInstance);

        expect(collection).toBe(collections[0]);
        expect(Object.keys(collection)).toHaveLength(6);
    });

    test('does not invent a description the API never sent', async () => {
        // Checked against a real tenant: all 17 collections came back with no
        // `description` key at all, not merely an undefined one. Manufacturing
        // an empty string here would change what --outputformat json prints,
        // and would hide the fact that the table's `=== undefined` guard is the
        // thing actually handling this.
        Get.mockResolvedValue([{ id: 'collection-1', name: 'Finance', itemCount: 4 }]);

        const [collection] = await listCollections(saasInstance);

        expect('description' in collection).toBe(false);
    });

    test('asks the collections endpoint', async () => {
        Get.mockResolvedValue([]);

        await listCollections(saasInstance);

        expect(Get).toHaveBeenCalledWith('collections');
    });

    test('returns an empty list for a tenant with no collections', async () => {
        Get.mockResolvedValue([]);

        await expect(listCollections(saasInstance)).resolves.toEqual([]);
    });

    test('propagates an API failure rather than reporting no collections', async () => {
        Get.mockRejectedValue(new Error('401 Unauthorized'));

        await expect(listCollections(saasInstance)).rejects.toThrow('401 Unauthorized');
    });
});

describe('listApps', () => {
    test('returns id and name for every app on the tenant', async () => {
        Get.mockResolvedValue([
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

        await expect(listApps(saasInstance)).resolves.toEqual([
            { id: 'app-a', name: 'Alpha' },
            { id: 'app-b', name: 'Beta' },
        ]);
    });

    test('asks the items endpoint, scoped to apps', async () => {
        // Scoped in the query rather than filtered afterwards: an unscoped list
        // on a large tenant is every item of every type, paged.
        Get.mockResolvedValue([]);

        await listApps(saasInstance);

        expect(Get).toHaveBeenCalledWith('items?resourceType=app');
    });

    test('falls back to the id when the API supplies no name', async () => {
        // A picker showing a bare GUID is no better than typing one, but it
        // beats showing "undefined".
        Get.mockResolvedValue([
            { id: 'item-a', resourceType: 'app', resourceAttributes: { id: 'app-a' } },
        ]);

        await expect(listApps(saasInstance)).resolves.toEqual([{ id: 'app-a', name: 'app-a' }]);
    });

    test('skips anything that is not an app, and says which', async () => {
        Get.mockResolvedValue([
            {
                id: 'item-a',
                resourceType: 'app',
                resourceAttributes: { id: 'app-a', name: 'Alpha' },
            },
            { id: 'item-ds', resourceType: 'dataset' },
        ]);

        await expect(listApps(saasInstance)).resolves.toEqual([{ id: 'app-a', name: 'Alpha' }]);
        expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('item-ds'));
        expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('dataset'));
    });

    test('returns an empty list for a tenant with no apps', async () => {
        Get.mockResolvedValue([]);

        await expect(listApps(saasInstance)).resolves.toEqual([]);
    });

    test('propagates an API failure rather than reporting no apps', async () => {
        Get.mockRejectedValue(new Error('403 Forbidden'));

        await expect(listApps(saasInstance)).rejects.toThrow('403 Forbidden');
    });
});

describe('both app sources agree on shape', () => {
    // The reason the item mapping is shared. An app picker offering "all apps"
    // and "apps in a collection" must not have to care which list it is holding,
    // and the two would drift apart the moment they mapped items separately.
    test('a collection and the tenant list describe the same app identically', async () => {
        const item = {
            id: 'item-a',
            resourceType: 'app',
            resourceAttributes: { id: 'app-a', name: 'Alpha' },
        };

        Get.mockImplementation(async (path) => {
            if (path === 'collections') return [{ id: COLLECTION_ID }];
            return [item];
        });

        const [fromCollection] = await getAppIdsByCollection(saasInstance, COLLECTION_ID);
        const [fromTenant] = await listApps(saasInstance);

        expect(fromCollection).toEqual(fromTenant);
    });
});
