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
    appVersion: '9.9.9-test',
    getLoggingLevel: jest.fn(() => 'info'),
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
    appid: ['test-app-id'],
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
            // qData carries `thumbnail` because SHEET_LIST_FIELDS_EXTENDED
            // projects /thumbnail and a real engine answers it. A fixture that
            // omitted it made every planner test take a fallback branch that
            // production never reaches, so the tests passed for a reason that
            // did not hold against a real server.
            qData: { rank, thumbnail: { qStaticContentUrlDef: { qUrl: existingUrl } } },
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
        // The report's best-effort app-name source; the engine layout, so a
        // run that names its apps with --appid still makes no QRS calls.
        getAppLayout: jest.fn().mockResolvedValue({ qTitle: 'Finance operations' }),
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

    describe('no app selection', () => {
        test('returns false when neither --appid nor --qliksensetag is provided', async () => {
            await expect(
                qseowRemoveSheetIcons({
                    ...BASE_OPTIONS,
                    appid: '',
                    qliksensetag: '',
                })
            ).resolves.toBe(false);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('No apps to process');
            expect(errors).toContain('Check the --appid and --qliksensetag options');
        });

        test('never connects to the engine when no apps are specified', async () => {
            await qseowRemoveSheetIcons({
                ...BASE_OPTIONS,
                appid: '',
                qliksensetag: '',
            });

            expect(enigmaCreate).not.toHaveBeenCalled();
        });
    });

    describe('single app via --appid', () => {
        test('returns true after processing the app', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);

            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(true);
        });

        test('says it removed icons, not that it updated or generated them', async () => {
            // This command clears sheet icons. The two twins previously claimed "updating" and
            // "generating" respectively - neither of which it does, and they disagreed with
            // each other about which wrong verb to use.
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            const logged = [...logger.info.mock.calls, ...logger.verbose.mock.calls]
                .map((call) => String(call[0]))
                .join('\n');
            expect(logged).toContain('Closed session after removing sheet icons in QSEoW app');
            expect(logged).not.toContain('after updating sheet thumbnail');
            expect(logged).not.toContain('after generating sheet thumbnail');
        });

        test('reports the created session at info, like the other top-level commands', async () => {
            // A command working on an app the operator named. Its own "Opened app" line is
            // already info and the default log level is info, so the session line belongs there
            // too - only the update step, which re-opens an already-reported app, stays verbose.
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            const atInfo = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(atInfo).toContain('Created session to');
        });

        test('names the removal command in the per-app failure line', async () => {
            // The app loop was told 'CLOUD PROCESS APP 2' and 'QSEOW PROCESS APP: Remove sheet
            // icons' respectively - a stray counter on one, a double colon on the other, and
            // neither naming the command actually running.
            const { app } = wireEnigma([makeSheet('sheet-1', 1)]);
            app.doSave.mockRejectedValue(new Error('app is published and cannot be saved'));

            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(false);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('QSEOW REMOVE SHEET ICONS: Failed to process app');
            expect(errors).not.toContain('QSEOW PROCESS APP');
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

        test('saves the app once, not once per sheet', async () => {
            // Saving inside the loop wrote the app N times for N sheets and produced N
            // app versions.
            const sheets = [makeSheet('sheet-1', 1), makeSheet('sheet-2', 2)];
            const { app } = wireEnigma(sheets);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(app.doSave).toHaveBeenCalledTimes(1);
        });

        test('does not save an app whose sheets were all left alone', async () => {
            const { app } = wireEnigma([]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(app.doSave).not.toHaveBeenCalled();
        });

        test('releases the engine session even when the save fails', async () => {
            // Without a finally around save-and-close the websocket leaked once per app
            // whose save was refused - a published app, or one the account cannot write.
            const { app, session } = wireEnigma([makeSheet('sheet-1', 1)]);
            app.doSave.mockRejectedValue(new Error('app is published and cannot be saved'));

            // The command reports failure rather than rejecting - runOverApps catches the
            // per-app error. What matters here is that the session was still released.
            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(false);

            expect(session.close).toHaveBeenCalledTimes(1);
        });

        test('saves before closing the engine session', async () => {
            const { app, session } = wireEnigma([makeSheet('sheet-1', 1)]);
            const order = [];
            app.doSave.mockImplementation(async () => order.push('save'));
            session.close.mockImplementation(async () => order.push('close'));

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(order).toEqual(['save', 'close']);
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

        test('does not look apps up by tag when no tag is given', async () => {
            // This asserted "no QRS call at all" while the published-app count
            // did not exist. That count is now read on every run - it is the
            // fact a removal most needs stated before it writes - so the
            // invariant worth pinning is the narrower one: the tag lookup
            // must not fire for a run that named its apps directly.
            wireEnigma([makeSheet('sheet-1', 1)]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            const paths = Get.mock.calls.map((call) => String(call[0]));
            expect(paths.some((path) => path.startsWith('app/full'))).toBe(false);
            expect(paths.every((path) => path.startsWith('app/count'))).toBe(true);
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

            // Decoded, because the path goes out URL-encoded.
            expect(decodeURIComponent(Get.mock.calls[0][0])).toBe(
                "app/full?filter=(tags.name eq 'BSI')"
            );
        });

        test('a tag containing an ampersand is not truncated by the query string', async () => {
            wireEnigma([makeSheet('sheet-1', 1)]);
            Get.mockResolvedValue({ body: [] });

            await qseowRemoveSheetIcons({
                ...BASE_OPTIONS,
                appid: '',
                qliksensetag: 'R&D',
            });

            const [path] = Get.mock.calls[0];
            expect(path).toContain('%26');
            expect(decodeURIComponent(path)).toBe("app/full?filter=(tags.name eq 'R&D')");
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

            // As above: the plan's published-app count may be read, but an
            // empty tag must never reach the app/full tag lookup.
            const paths = Get.mock.calls.map((call) => String(call[0]));
            expect(paths.some((path) => path.startsWith('app/full'))).toBe(false);
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

        test('reports failure when a sheet could not be updated, without rejecting', async () => {
            // Isolation is not the same as success. This used to resolve true, so an app in
            // which no icon at all was removed looked identical to a clean run and the
            // process exited 0.
            const sheet = makeSheet('sheet-1', 1);
            sheet.obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma([sheet]);

            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(false);

            expect(logger.error).toHaveBeenCalled();
        });

        test('says how many sheets failed', async () => {
            const sheets = [
                makeSheet('sheet-1', 1),
                makeSheet('sheet-2', 2),
                makeSheet('sheet-3', 3),
            ];
            sheets[0].obj.setProperties.mockRejectedValue(new Error('sheet is read-only'));
            wireEnigma(sheets);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('Failed to remove icons for 1 of 3 sheet(s)');
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

    describe('malformed sheets', () => {
        test('a sheet with no qMeta is still cleared - the log line must not fail it', async () => {
            // The real run named sheet.qMeta.title unguarded in its progress
            // log while the planner read it optionally, so a sheet the engine
            // returned without qMeta was planned as a clean clear and then
            // threw in the real run - failing that sheet, and the app with it,
            // after the sheets around it had already been cleared and saved.
            const bare = makeSheet('s1', 1);
            delete bare.item.qMeta;
            const fine = makeSheet('s2', 2);
            const { app } = wireEnigma([bare, fine]);

            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(true);

            expect(bare.obj.setProperties).toHaveBeenCalledTimes(1);
            expect(fine.obj.setProperties).toHaveBeenCalledTimes(1);
            expect(app.doSave).toHaveBeenCalledTimes(1);
        });

        test('a sheet with no qMeta is planned without failing the dry run either', async () => {
            const bare = makeSheet('s1', 1);
            delete bare.item.qMeta;
            wireEnigma([bare]);

            await expect(qseowRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true })).resolves.toBe(
                true
            );
        });
    });

    describe('a second removal over an already-cleared app (issue #1113)', () => {
        test('skips every sheet and does not save the app', async () => {
            // The state this command itself leaves behind: the thumbnail
            // structure is present with an empty URL. The real run used to ask
            // whether the structure existed, so it wrote and saved every sheet
            // again - a visible change on a published app, made by a command
            // whose dry run had just reported there was nothing to do.
            const sheets = [makeSheet('s1', 1, ''), makeSheet('s2', 2, '')];
            const { app } = wireEnigma(sheets);

            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(true);

            for (const sheet of sheets) {
                expect(sheet.obj.setProperties).not.toHaveBeenCalled();
            }
            expect(app.doSave).not.toHaveBeenCalled();
        });

        test('reports them as no icon, exactly as the dry run predicts', async () => {
            const sheets = [makeSheet('s1', 1, ''), makeSheet('s2', 2, '')];
            wireEnigma(sheets);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(info).toContain('no icon');
            expect(info).toContain('0 icon(s) cleared');
            expect(info).toContain('2 had no icon');
        });

        test('a sheet that still has an icon is cleared alongside them', async () => {
            // The mixed case: skipping must not become "skip everything".
            const cleared = makeSheet('s1', 1, '');
            const stillSet = makeSheet('s2', 2, '/content/library/old.png');
            const { app } = wireEnigma([cleared, stillSet]);

            await qseowRemoveSheetIcons(BASE_OPTIONS);

            expect(cleared.obj.setProperties).not.toHaveBeenCalled();
            expect(stillSet.obj.setProperties).toHaveBeenCalledTimes(1);
            expect(app.doSave).toHaveBeenCalledTimes(1);
        });
    });

    describe('sheets without a thumbnail structure', () => {
        test('the real run skips, not fails, a sheet without a thumbnail structure', async () => {
            // The guard the Cloud twin got with the dry-run work: clearing a
            // sheet that has no thumbnail object used to throw and fail the
            // whole app.
            const broken = makeSheet('s1', 1);
            broken.obj.getProperties.mockResolvedValue({});
            const fine = makeSheet('s2', 2);
            const { app } = wireEnigma([broken, fine]);

            await expect(qseowRemoveSheetIcons(BASE_OPTIONS)).resolves.toBe(true);

            expect(broken.obj.setProperties).not.toHaveBeenCalled();
            expect(fine.obj.setProperties).toHaveBeenCalled();
            expect(app.doSave).toHaveBeenCalled();
        });
    });

    describe('--dry-run plans without writing', () => {
        test('writes nothing: no setProperties, no save', async () => {
            const sheets = [makeSheet('s1', 1), makeSheet('s2', 2)];
            const { app } = wireEnigma(sheets);

            await expect(qseowRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true })).resolves.toBe(
                true
            );

            for (const sheet of sheets) {
                expect(sheet.obj.setProperties).not.toHaveBeenCalled();
            }
            expect(app.doSave).not.toHaveBeenCalled();
        });

        test('reads each sheet through the same engine calls the real run uses', async () => {
            // Not from the projected qData.thumbnail: that read answers the
            // icon question correctly and still plans a clean clear for a
            // sheet the real run cannot open at all.
            const sheets = [makeSheet('s1', 1), makeSheet('s2', 2)];
            const { app } = wireEnigma(sheets);

            await qseowRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true });

            expect(app.getObject.mock.calls.map((call) => call[0])).toEqual(['s1', 's2']);
            for (const sheet of sheets) {
                expect(sheet.obj.getProperties).toHaveBeenCalledTimes(1);
            }
        });

        test('a sheet the engine cannot open fails the plan, as it would fail the run', async () => {
            // The real run on this input clears s1, saves the app, then fails
            // on s2. A plan that reported "2 icon(s) would be cleared" would
            // promise a clean sweep for a run that half-writes and fails.
            const good = makeSheet('s1', 1);
            const unreadable = makeSheet('s2', 2);
            const { app } = wireEnigma([good, unreadable]);
            app.getObject.mockImplementation(async (qId) => {
                if (qId === 's2') {
                    throw new Error('Object not found');
                }

                return good.obj;
            });

            await expect(qseowRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true })).resolves.toBe(
                false
            );

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toContain('QSEOW PLAN REMOVE ICONS');

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(info).toContain('this plan is incomplete');
        });

        test('the report names the app and the icons, and claims no media files', async () => {
            wireEnigma([makeSheet('s1', 1), makeSheet('s2', 2)]);

            await qseowRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true });

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(info).toContain('DRY RUN of qseow remove-sheet-icons');
            expect(info).toContain('"Finance operations"');
            expect(info).toContain('clear icon');
            expect(info).toContain('WOULD REMOVE sheet icons from 1 app(s)');
            // Unlike the Cloud twin, this platform leaves the content library
            // alone - the warning must not promise a deletion that never
            // happens.
            expect(info).not.toContain('thumbnail media files');
            expect(info).toContain('2 icon(s) would be cleared, 0 skipped.');
            expect(info).toContain('Nothing was changed. Re-run without --dry-run to apply.');
        });

        test('a sheet without an icon is reported, not skipped', async () => {
            const bare = makeSheet('s1', 1, '');
            wireEnigma([bare]);

            await qseowRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true });

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(info).toContain('(no icon currently set)');
        });

        test('the plan names how many selected apps are published', async () => {
            // The count comes from QRS app/count, the same read the thumbnail
            // command makes. A published app is the one whose save a removal
            // is refused by, so the plan has to state it before the work.
            wireEnigma([makeSheet('s1', 1)]);
            Get.mockImplementation(async (path) =>
                String(path).startsWith('app/count')
                    ? { statusCode: 200, body: { value: 1 } }
                    : { statusCode: 200, body: [] }
            );

            await qseowRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true });

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(info).toContain('WOULD REMOVE sheet icons from 1 app(s), 1 of them published');
        });

        test('a QRS that will not answer the published count still plans the run', async () => {
            // readQseowPlanFacts degrades to nulls: the count decorates the
            // plan, and a filter QRS rejects must not stop work the operator
            // asked for.
            wireEnigma([makeSheet('s1', 1)]);
            Get.mockRejectedValue(new Error('QRS unavailable'));

            await expect(qseowRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true })).resolves.toBe(
                true
            );

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(info).toContain('WOULD REMOVE sheet icons from 1 app(s)');
            expect(info).not.toContain('of them published');
        });

        test('the plan shows the api user but no logon user - nothing here drives a browser', async () => {
            wireEnigma([makeSheet('s1', 1)]);

            await qseowRemoveSheetIcons({
                ...BASE_OPTIONS,
                dryRun: true,
                apiuserdir: 'Internal',
                apiuserid: 'sa_api',
            });

            const info = logger.info.mock.calls.map((call) => String(call[0])).join('\n');
            expect(info).toContain('Internal\\sa_api');
            expect(info).not.toContain('logon user');
        });

        test('a failing app-name read never fails the app - the name is decorative', async () => {
            const { app } = wireEnigma([makeSheet('s1', 1)]);
            app.getAppLayout.mockRejectedValue(new Error('layout unavailable'));

            await expect(qseowRemoveSheetIcons({ ...BASE_OPTIONS, dryRun: true })).resolves.toBe(
                true
            );
        });

        test('the real run still writes when dryRun is absent - the control case', async () => {
            const sheets = [makeSheet('s1', 1)];
            wireEnigma(sheets);

            await qseowRemoveSheetIcons({ ...BASE_OPTIONS });

            expect(sheets[0].obj.setProperties).toHaveBeenCalled();
        });
    });
});
