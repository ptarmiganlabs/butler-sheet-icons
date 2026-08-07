import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const enigmaCreate = jest.fn();

jest.unstable_mockModule('enigma.js', () => ({
    default: { create: enigmaCreate },
}));

const Get = jest.fn();
const qrsInteract = jest.fn(function QrsInteract() {
    this.Get = Get;
});

jest.unstable_mockModule('qrs-interact', () => ({ default: qrsInteract }));

const setupEnigmaConnection = jest.fn().mockReturnValue({ url: 'wss://sense.example.com' });

jest.unstable_mockModule('../qseow-enigma.js', () => ({ setupEnigmaConnection }));

const qseowVerifyCertificatesExist = jest.fn().mockResolvedValue(true);

jest.unstable_mockModule('../qseow-certificates.js', () => ({ qseowVerifyCertificatesExist }));

jest.unstable_mockModule('../qseow-qrs.js', () => ({
    setupQseowQrsConnection: jest.fn().mockReturnValue({ hostname: 'sense.example.com' }),
}));

jest.unstable_mockModule('../../util/redact-secrets.js', () => ({
    redactOptions: jest.fn((options) => options),
}));

jest.unstable_mockModule('../../../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    },
    setLoggingLevel: jest.fn(),
    bsiExecutablePath: '/opt/bsi',
    isSea: false,
}));

const { logger } = await import('../../../globals.js');
const { qseowRemoveSheetIcons } = await import('../qseow-remove-sheet-icons.js');

const BASE_OPTIONS = {
    host: 'sense.example.com',
    engineport: '4747',
    qrsport: '4242',
    senseVersion: '2024-May',
    loglevel: 'info',
    appid: 'test-app-id',
    certfile: './cert/client.pem',
    certkeyfile: './cert/client_key.pem',
};

/**
 * Builds a sheet object plus the mock engine object that serves its properties.
 *
 * @param {string} qId - Engine object id for the sheet.
 * @param {number} rank - Sort rank; the module orders sheets by this.
 * @param {string} [existingUrl] - Thumbnail URL the sheet starts with.
 *
 * @returns {{item: object, obj: object, props: object}} The sheet list item, its engine
 *   object, and the properties object the engine object hands out.
 */
const makeSheet = (qId, rank, existingUrl = '/content/library/old.png') => {
    const props = { thumbnail: { qStaticContentUrlDef: { qUrl: existingUrl } } };
    const obj = {
        getProperties: jest.fn().mockResolvedValue(props),
        setProperties: jest.fn().mockResolvedValue({ ok: true }),
    };

    return {
        item: {
            qInfo: { qId },
            qMeta: { title: `Sheet ${qId}`, description: '', approved: false, published: false },
            qData: { rank },
        },
        obj,
        props,
    };
};

/**
 * Wires the enigma mock chain so the module can walk an app's sheets.
 *
 * @param {Array<{item: object, obj: object}>} sheets - Sheets the app should report.
 *
 * @returns {{app: object, session: object}} The mock app and session objects.
 */
const wireEnigma = (sheets) => {
    const byId = new Map(sheets.map((sheet) => [sheet.item.qInfo.qId, sheet.obj]));

    const app = {
        createSessionObject: jest.fn().mockResolvedValue({
            getLayout: jest.fn().mockResolvedValue({
                qAppObjectList: { qItems: sheets.map((sheet) => sheet.item) },
            }),
        }),
        getObject: jest.fn(async (qId) => byId.get(qId)),
        doSave: jest.fn().mockResolvedValue(true),
    };

    const session = {
        open: jest.fn().mockResolvedValue({
            engineVersion: jest.fn().mockResolvedValue({ qComponentVersion: '12.0.0' }),
            openDoc: jest.fn().mockResolvedValue(app),
        }),
        close: jest.fn().mockResolvedValue(true),
        on: jest.fn(),
    };

    enigmaCreate.mockResolvedValue(session);

    return { app, session };
};

beforeEach(() => {
    jest.clearAllMocks();
    qseowVerifyCertificatesExist.mockResolvedValue(true);
    setupEnigmaConnection.mockReturnValue({ url: 'wss://sense.example.com' });
    // enigmaCreate carries no default, so a rejection set by one test would otherwise
    // persist for the rest of the file.
    enigmaCreate.mockReset();
});

describe('qseowRemoveSheetIcons', () => {
    describe('certificate check', () => {
        test('returns false when the certificates are missing', async () => {
            qseowVerifyCertificatesExist.mockResolvedValue(false);

            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(false);
        });

        test('never opens an engine session when the certificates are missing', async () => {
            qseowVerifyCertificatesExist.mockResolvedValue(false);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(enigmaCreate).not.toHaveBeenCalled();
        });

        test('says which check failed', async () => {
            qseowVerifyCertificatesExist.mockResolvedValue(false);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');

            expect(errors).toContain('Missing certificate file(s)');
        });
    });

    describe('single app via --appid', () => {
        test('returns true after processing the app', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);

            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(true);
        });

        test('clears the thumbnail URL on every sheet', async () => {
            const sheets = [makeSheet('sheet-1', 1), makeSheet('sheet-2', 2)];
            wireEnigma(sheets);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            sheets.forEach((sheet) => {
                expect(sheet.obj.setProperties).toHaveBeenCalledTimes(1);
                expect(sheet.props.thumbnail.qStaticContentUrlDef.qUrl).toBe('');
            });
        });

        test('saves the app once per sheet', async () => {
            const sheets = [makeSheet('sheet-1', 1), makeSheet('sheet-2', 2)];
            const { app } = wireEnigma(sheets);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(app.doSave).toHaveBeenCalledTimes(2);
        });

        test('processes sheets in rank order', async () => {
            const sheets = [
                makeSheet('sheet-c', 3),
                makeSheet('sheet-a', 1),
                makeSheet('sheet-b', 2),
            ];
            const { app } = wireEnigma(sheets);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(app.getObject.mock.calls.map((call) => call[0])).toEqual([
                'sheet-a',
                'sheet-b',
                'sheet-c',
            ]);
        });

        test('still processes the well-formed sheets when one sheet has no qData', async () => {
            // Sorting runs before the per-sheet try/catch blocks, so an unguarded read of
            // sheet.qData.rank in the comparator aborted the whole app before a single
            // icon was touched. The rank-less sheet now sorts last.
            const broken = makeSheet('broken', 1);
            delete broken.item.qData;
            const { app } = wireEnigma([makeSheet('sheet-b', 2), broken, makeSheet('sheet-a', 1)]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(app.getObject.mock.calls.map((call) => call[0])).toEqual([
                'sheet-a',
                'sheet-b',
                'broken',
            ]);
        });

        test('closes the engine session when done', async () => {
            const { session } = wireEnigma([makeSheet('sheet-1', 1)]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(session.close).toHaveBeenCalledTimes(1);
        });

        test('handles an app with no sheets', async () => {
            wireEnigma([]);

            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(true);
        });

        test('closes the session even when the app has no sheets', async () => {
            // session.close() used to sit inside the `qItems.length > 0` guard, so an
            // empty app returned true while leaking its engine websocket.
            const { session } = wireEnigma([]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(session.close).toHaveBeenCalledTimes(1);
        });

        test('does not query QRS when no tag is given', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(Get).not.toHaveBeenCalled();
        });
    });

    describe('multiple apps via --qliksensetag', () => {
        test('processes every app carrying the tag', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            Get.mockResolvedValue({ body: [{ id: 'app-a' }, { id: 'app-b' }] });

            await qseowRemoveSheetIcons({
                ...BASE_OPTIONS,
                appid: '',
                qliksensetag: 'BSI',
            });

            // Assert WHICH apps, not just how many: setupEnigmaConnection is mocked to a
            // constant, so a call count alone cannot tell two apps from the same app twice.
            expect(setupEnigmaConnection.mock.calls.map((call) => call[0])).toEqual([
                'app-a',
                'app-b',
            ]);
            expect(enigmaCreate).toHaveBeenCalledTimes(2);
        });

        test('passes the real connection options to the enigma builder', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(setupEnigmaConnection).toHaveBeenCalledWith(
                'test-app-id',
                expect.objectContaining({
                    host: 'sense.example.com',
                    engineport: '4747',
                    certfile: './cert/client.pem',
                    certkeyfile: './cert/client_key.pem',
                })
            );
        });

        test('filters QRS on the supplied tag', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            Get.mockResolvedValue({ body: [] });

            await qseowRemoveSheetIcons({
                ...BASE_OPTIONS,
                appid: '',
                qliksensetag: 'BSI',
            });

            expect(Get).toHaveBeenCalledWith("app/full?filter=tags.name eq 'BSI'");
        });

        test('processes an app named by both --appid and the tag only once', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            Get.mockResolvedValue({ body: [{ id: 'test-app-id' }, { id: 'app-b' }] });

            await qseowRemoveSheetIcons({ ...BASE_OPTIONS, qliksensetag: 'BSI' });

            expect(enigmaCreate).toHaveBeenCalledTimes(2);
        });

        test('returns false when the QRS tag lookup fails', async () => {
            Get.mockRejectedValue(new Error('ECONNREFUSED'));

            await expect(
                qseowRemoveSheetIcons({ ...BASE_OPTIONS, appid: '', qliksensetag: 'BSI' })
            ).resolves.toBe(false);
        });

        test('treats an empty tag as no tag at all', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qseowRemoveSheetIcons({ ...BASE_OPTIONS, qliksensetag: '' });

            expect(Get).not.toHaveBeenCalled();
            expect(enigmaCreate).toHaveBeenCalledTimes(1);
        });
    });

    describe('error handling', () => {
        test('a failing app does not abort the run', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            enigmaCreate.mockRejectedValueOnce(new Error('engine unreachable'));
            Get.mockResolvedValue({ body: [{ id: 'app-a' }, { id: 'app-b' }] });

            // The other app is still attempted - but the run as a whole is a failure now,
            // not a success with error text buried in the log.
            await expect(
                qseowRemoveSheetIcons({ ...BASE_OPTIONS, appid: '', qliksensetag: 'BSI' })
            ).resolves.toBe(false);

            expect(enigmaCreate).toHaveBeenCalledTimes(2);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('Failed to process 1 of 2 app(s)');
        });

        test('reports failure instead of rejecting when the engine is unreachable', async () => {
            enigmaCreate.mockRejectedValue(new Error('engine unreachable'));

            // Reports false rather than throwing: the caller sets the exit code from it.
            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(false);

            expect(logger.error).toHaveBeenCalled();
        });

        test('logs a per-sheet failure instead of rejecting', async () => {
            const sheet = makeSheet('sheet-1', 1);
            sheet.obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma([sheet]);

            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(true);

            expect(logger.error).toHaveBeenCalled();
        });

        test('a failing sheet does not stop the sheets after it', async () => {
            // A one-sheet fixture cannot tell isolation from abort: the outer catch
            // satisfies resolves.toBe(true) either way.
            const sheets = [
                makeSheet('sheet-1', 1),
                makeSheet('sheet-2', 2),
                makeSheet('sheet-3', 3),
            ];
            sheets[0].obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma(sheets);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(sheets[1].obj.setProperties).toHaveBeenCalledTimes(1);
            expect(sheets[2].obj.setProperties).toHaveBeenCalledTimes(1);
        });

        test('still closes the session when a sheet fails', async () => {
            const sheet = makeSheet('sheet-1', 1);
            sheet.obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            const { session } = wireEnigma([sheet]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(session.close).toHaveBeenCalledTimes(1);
        });
    });
});
