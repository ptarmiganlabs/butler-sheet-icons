import { jest, describe, test, expect } from '@jest/globals';

import { qrsGetList } from '../qrs-response.js';
import { QseowError } from '../../util/errors.js';

/**
 * Builds a qrs-interact stand-in whose `Get` resolves to the supplied response.
 *
 * @param {object} response - What `Get` should resolve to.
 *
 * @returns {object} An object with a `Get` method.
 */
const respondingWith = (response) => ({ Get: jest.fn().mockResolvedValue(response) });

describe('qrsGetList', () => {
    test('returns the body when QRS answers with a list', async () => {
        const rows = [{ id: 'a' }, { id: 'b' }];

        await expect(
            qrsGetList(respondingWith({ statusCode: 200, body: rows }), 'app')
        ).resolves.toBe(rows);
    });

    test('an empty list is a real answer, not a failure', async () => {
        // The distinction the whole helper exists for: nothing matched the filter, which is
        // ordinary, versus a response this code cannot read, which is not.
        await expect(
            qrsGetList(respondingWith({ statusCode: 200, body: [] }), 'app')
        ).resolves.toEqual([]);
    });

    test('passes the path through to Get unchanged', async () => {
        const instance = respondingWith({ statusCode: 200, body: [] });

        await qrsGetList(instance, "app/full?filter=name eq 'x'");

        expect(instance.Get).toHaveBeenCalledWith("app/full?filter=name eq 'x'");
    });

    describe('a body that is not a list', () => {
        test.each([
            ['an error object', { error: 'proxy failure' }, 'object'],
            ['null', null, 'null'],
            ['an HTML error page', '<html>502 Bad Gateway</html>', 'string'],
            ['a number', 42, 'number'],
            ['undefined', undefined, 'undefined'],
        ])('%s throws rather than looking like an empty result', async (_label, body, shape) => {
            // Left to the call sites these produced three different wrong answers from the same
            // guard: an object read as "nothing matched", null threw a TypeError, and a non-empty
            // string read as a successful match because its length is greater than zero.
            const promise = qrsGetList(respondingWith({ statusCode: 200, body }), 'app');

            await expect(promise).rejects.toThrow(QseowError);
            await expect(promise).rejects.toThrow(new RegExp(`got ${shape}`));
        });

        test('names the path, so the operator knows which call failed', async () => {
            await expect(
                qrsGetList(respondingWith({ statusCode: 200, body: {} }), 'contentlibrary?filter=x')
            ).rejects.toThrow(/contentlibrary\?filter=x/);
        });
    });

    describe('a non-success status', () => {
        test.each([[403], [404], [500]])(
            '%i throws rather than reporting no matches',
            async (statusCode) => {
                // 403 in particular: the account may not read this, which is not the same as the
                // thing being absent, and the two used to share a return value.
                await expect(
                    qrsGetList(respondingWith({ statusCode, body: [{ id: 'a' }] }), 'app')
                ).rejects.toThrow(QseowError);
            }
        );

        test.each([[200], [201], [204]])('%i is accepted', async (statusCode) => {
            await expect(
                qrsGetList(respondingWith({ statusCode, body: [] }), 'app')
            ).resolves.toEqual([]);
        });

        test('a response with no status at all is judged on its body alone', async () => {
            // Not every caller's stub sets a status, and absence is not failure.
            await expect(qrsGetList(respondingWith({ body: [] }), 'app')).resolves.toEqual([]);
        });
    });

    test('a rejecting Get is left alone rather than wrapped', async () => {
        const failure = new Error('ECONNREFUSED');

        await expect(qrsGetList({ Get: jest.fn().mockRejectedValue(failure) }, 'app')).rejects.toBe(
            failure
        );
    });
});
