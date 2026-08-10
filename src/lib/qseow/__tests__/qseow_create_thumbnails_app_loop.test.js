import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// QSEoW twin of cloud_create_thumbnails_app_loop.test.js. Covers the hand-off from
// qseowCreateThumbnails to runOverApps. The sibling validation suite mocks the certificate
// check to throw, so it never reaches this point - which left the app-loop call site with
// no unit coverage at all.

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
    sleep: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../qseow-certificates.js', () => ({
    qseowVerifyCertificatesExist: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../qseow-contentlibrary.js', () => ({
    qseowVerifyContentLibraryExists: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../qseow-qrs.js', () => ({
    setupQseowQrsConnection: jest.fn().mockReturnValue({ hostname: 'sense.example.com' }),
}));

jest.unstable_mockModule('qrs-interact', () => ({ default: jest.fn() }));

jest.unstable_mockModule('../qseow-process-app.js', () => ({
    qseowProcessApp: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../util/redact-secrets.js', () => ({
    redactOptions: jest.fn((o) => o),
}));

const runOverApps = jest.fn();
jest.unstable_mockModule('../../util/run-over-apps.js', () => ({ runOverApps }));

const { logger } = await import('../../../globals.js');
const qrsInteract = (await import('qrs-interact')).default;
const { qseowCreateThumbnails } = await import('../qseow-create-thumbnails.js');

const OPTIONS = {
    host: 'sense.example.com',
    contentlibrary: 'test-library',
    appid: 'test-app-id',
    includesheetpart: '1',
    loglevel: 'info',
};

/**
 * Joins everything logged at error level, for substring assertions.
 *
 * @returns {string} All error lines, newline separated.
 */
const errorLog = () => logger.error.mock.calls.map((call) => String(call[0])).join('\n');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('qseowCreateThumbnails app loop', () => {
    test('passes the verdict from runOverApps straight through', async () => {
        runOverApps.mockResolvedValue(true);

        await expect(qseowCreateThumbnails({ ...OPTIONS })).resolves.toBe(true);
    });

    test('reports failure when runOverApps says some apps failed', async () => {
        runOverApps.mockResolvedValue(false);

        await expect(qseowCreateThumbnails({ ...OPTIONS })).resolves.toBe(false);
    });

    test('hands the selected app ids to the loop', async () => {
        runOverApps.mockResolvedValue(true);

        await qseowCreateThumbnails({ ...OPTIONS });

        expect(runOverApps).toHaveBeenCalledTimes(1);
        expect(runOverApps.mock.calls[0][0]).toEqual(['test-app-id']);
    });

    test('names the QSEoW options in the empty-selection hint, not the Cloud ones', async () => {
        // The twin asserts the mirror image. Swapping these two hints is the exact
        // cross-platform copy-paste this repo keeps producing, and the text is promised
        // to operators in the published docs.
        runOverApps.mockResolvedValue(true);

        await qseowCreateThumbnails({ ...OPTIONS });

        expect(runOverApps.mock.calls[0][1].emptySelectionHint).toContain('--qliksensetag');
        expect(runOverApps.mock.calls[0][1].emptySelectionHint).not.toContain('--collectionid');
    });

    describe('QRS tag lookup', () => {
        /**
         * Wires the qrs-interact mock and returns the mock `Get`.
         *
         * @returns {jest.Mock} The mock `Get` method.
         */
        const wireQrs = () => {
            const Get = jest.fn().mockResolvedValue({ body: [] });
            qrsInteract.mockImplementation(() => ({ Get }));
            return Get;
        };

        test.each([
            ['an error object', { error: 'proxy failure' }],
            ['null', null],
            ['an HTML error page', '<html>502 Bad Gateway</html>'],
        ])('reports %s as a QRS failure, not as an app list', async (_label, body) => {
            // The tag lookup used to reach straight into `.body` and call `.map` on it, so an
            // unreadable QRS reply surfaced as `TypeError: result.body.map is not a function`
            // - an internal error naming nothing the operator could act on. Reading through
            // qrsGetList makes the response itself the reported problem.
            const Get = wireQrs();
            Get.mockResolvedValue({ statusCode: 200, body });
            runOverApps.mockResolvedValue(true);

            await expect(
                qseowCreateThumbnails({ ...OPTIONS, appid: '', qliksensetag: 'BSI' })
            ).resolves.toBe(false);

            const errors = logger.error.mock.calls.map((call) => String(call[0])).join('\n');
            expect(errors).toMatch(/unusable response|is not a function/);
            expect(errors).toContain('unusable response');
        });

        test('encodes the tag so an ampersand cannot truncate the query string', async () => {
            // Raw, the `&` starts a new query parameter and QRS answers
            // 400::Missing parameter value(s) - verified against a live QSEoW.
            const Get = wireQrs();
            runOverApps.mockResolvedValue(true);

            await qseowCreateThumbnails({ ...OPTIONS, appid: '', qliksensetag: 'R&D' });

            const [path] = Get.mock.calls[0];
            expect(path).toContain('%26');
            expect(decodeURIComponent(path)).toBe("app/full?filter=(tags.name eq 'R&D')");
        });

        test('backslash-escapes a quote in the tag', async () => {
            const Get = wireQrs();
            runOverApps.mockResolvedValue(true);

            await qseowCreateThumbnails({ ...OPTIONS, appid: '', qliksensetag: "Q1'25" });

            expect(decodeURIComponent(Get.mock.calls[0][0])).toBe(
                "app/full?filter=(tags.name eq 'Q1\\'25')"
            );
        });
    });

    test('catches a rejection from the loop rather than letting it escape', async () => {
        // The call site must be `return await runOverApps(...)`. A bare `return` hands the
        // promise back before it settles, so a rejection skips the catch below it - this
        // function would reject instead of resolving false, and log nothing.
        runOverApps.mockRejectedValue(new Error('loop blew up'));

        await expect(qseowCreateThumbnails({ ...OPTIONS })).resolves.toBe(false);

        expect(errorLog()).toContain('QSEOW CREATE THUMBNAILS 2');
    });
});
