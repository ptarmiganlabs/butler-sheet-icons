import { jest, describe, test, expect } from '@jest/globals';

import { saasGetList } from '../saas-response.js';
import { CloudError } from '../../util/errors.js';

/**
 * Builds a QlikSaas stand-in whose `Get` resolves to the supplied response.
 *
 * @param {Array<object>|object|string|null|undefined} response - What `Get` should resolve to.
 *
 * @returns {object} An object with a `Get` method.
 */
const respondingWith = (response) => ({ Get: jest.fn().mockResolvedValue(response) });

describe('saasGetList', () => {
    test('returns the response when the tenant answers with a list', async () => {
        const rows = [{ id: 'a' }, { id: 'b' }];

        await expect(saasGetList(respondingWith(rows), 'collections')).resolves.toBe(rows);
    });

    test('an empty list is a real answer, not a failure', async () => {
        // The distinction the whole helper exists for: a tenant with no collections, which is
        // ordinary, versus a response this code cannot read, which is not.
        await expect(saasGetList(respondingWith([]), 'collections')).resolves.toEqual([]);
    });

    test('passes the path through to Get unchanged', async () => {
        const saasInstance = respondingWith([]);

        await saasGetList(saasInstance, 'collections/abc-123/items');

        expect(saasInstance.Get).toHaveBeenCalledWith('collections/abc-123/items');
    });

    // The shapes below are the ones `request()` in cloud-repo-request.js can actually hand back
    // for a 200, traced through its unwrap rather than assumed. An earlier version of this suite
    // fed in `{ data: {}, status: 403 }` and similar, which reads plausibly but cannot occur:
    // axios rejects on 4xx and 5xx, and `request()` unwraps the envelope for any truthy body.
    describe('a 200 whose body is not a list', () => {
        test('an HTML page from a proxy is reported as a string', async () => {
            await expect(
                saasGetList(respondingWith('<html>502 Bad Gateway</html>'), 'collections')
            ).rejects.toThrow(/expected a list, got string/);
        });

        test('an error document is reported as an object', async () => {
            await expect(
                saasGetList(respondingWith({ errors: [{ code: 'x' }] }), 'collections')
            ).rejects.toThrow(/expected a list, got object/);
        });

        test('throws a typed CloudError, not a bare Error', async () => {
            await expect(saasGetList(respondingWith({}), 'collections')).rejects.toThrow(
                CloudError
            );
        });

        test('names the path, so the operator knows which call failed', async () => {
            await expect(
                saasGetList(respondingWith('<html>'), 'items?resourceType=app')
            ).rejects.toThrow(/items\?resourceType=app/);
        });
    });

    describe('a success response with no body at all', () => {
        // The only shape where the status survives request()'s unwrap: a falsy body leaves the
        // `{ data, status }` envelope intact.
        test('says the tenant answered with an empty body, and gives the status', async () => {
            await expect(
                saasGetList(respondingWith({ data: '', status: 200 }), 'collections')
            ).rejects.toThrow(/status 200 and an empty body/);
        });

        test('does not claim the body was an object', async () => {
            // "got object" would be true of the envelope and useless about the response.
            await expect(
                saasGetList(respondingWith({ data: '', status: 204 }), 'collections')
            ).rejects.not.toThrow(/got object/);
        });
    });

    describe('a response that is not a list and carries no status', () => {
        test('names the shape when it is a bare object', async () => {
            await expect(
                saasGetList(respondingWith({ collections: [] }), 'collections')
            ).rejects.toThrow(/expected a list, got object/);
        });

        test('distinguishes null from object', async () => {
            // typeof null is 'object', which would be actively misleading in the message.
            await expect(saasGetList(respondingWith(null), 'collections')).rejects.toThrow(
                /expected a list, got null/
            );
        });

        test('names the shape when it is a string', async () => {
            await expect(saasGetList(respondingWith('nope'), 'collections')).rejects.toThrow(
                /expected a list, got string/
            );
        });

        test('throws a typed CloudError, not a bare Error', async () => {
            await expect(saasGetList(respondingWith(undefined), 'collections')).rejects.toThrow(
                CloudError
            );
        });
    });

    test('a rejecting Get is left alone rather than wrapped', async () => {
        // Transport failures already carry their own diagnosis from cloud-repo-request.js.
        // Rewrapping them here would bury the status and code that interceptor preserved.
        const saasInstance = { Get: jest.fn().mockRejectedValue(new Error('401 Unauthorized')) };

        await expect(saasGetList(saasInstance, 'collections')).rejects.toThrow('401 Unauthorized');
    });
});
