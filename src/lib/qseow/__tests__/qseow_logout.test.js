import { describe, expect, jest, test } from '@jest/globals';

const logger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    verbose: jest.fn(),
    warn: jest.fn(),
};
const sleep = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../../globals.js', () => ({ logger, sleep }));

const {
    QSEOW_LOGOUT_API_TIMEOUT_MS,
    QSEOW_LOGOUT_BUTTON_SELECTOR,
    qseowLogout,
    qseowLogoutQuietly,
} = await import('../qseow-logout.js');

/**
 * Builds a page mock for the API and hub logout paths.
 *
 * @returns {object} Puppeteer-shaped page mock.
 */
const buildPage = () => {
    const userMenuButton = { click: jest.fn().mockResolvedValue(undefined) };
    const logoutButton = { click: jest.fn().mockResolvedValue(undefined) };

    return {
        evaluate: jest.fn().mockResolvedValue(204),
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        $$: jest.fn().mockResolvedValueOnce([userMenuButton]).mockResolvedValueOnce([logoutButton]),
        userMenuButton,
        logoutButton,
    };
};

const logoutOptions = {
    prefix: '',
    hubUrl: 'https://sense.example.com/form/hub',
    pageTimeout: 90000,
    pagewait: 0,
    senseVersion: '2026-May',
};
const hubUserPageButton =
    'xpath/.//*[@id="q-hub-toolbar"]/div[2]/div[5]/div/div/div/button/span/span';
const legacyLogoutButton = 'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[4]/span[2]';

describe('qseowLogout', () => {
    test('uses the QPS API and does not open the hub when it returns 204', async () => {
        const page = buildPage();

        await expect(qseowLogout(page, logoutOptions, hubUserPageButton)).resolves.toBe(true);

        expect(page.evaluate).toHaveBeenCalledTimes(1);
        const [evaluateFn, path, xrfKey, timeoutMs] = page.evaluate.mock.calls[0];
        expect(path).toBe('/qps/user');
        expect(xrfKey).toMatch(/^[a-f0-9]{16}$/);
        expect(timeoutMs).toBe(QSEOW_LOGOUT_API_TIMEOUT_MS);
        expect(page.goto).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();

        const fetchMock = jest.fn().mockResolvedValue({ status: 204 });
        const previousFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;

        try {
            await evaluateFn(path, xrfKey, timeoutMs);
        } finally {
            globalThis.fetch = previousFetch;
        }

        expect(fetchMock).toHaveBeenCalledWith(`${path}?xrfkey=${xrfKey}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { 'X-Qlik-Xrfkey': xrfKey },
            signal: expect.any(Object),
        });
    });

    test('includes the virtual proxy prefix in the QPS API path', async () => {
        const page = buildPage();

        await qseowLogout(page, { ...logoutOptions, prefix: 'form' }, hubUserPageButton);

        expect(page.evaluate.mock.calls[0][1]).toBe('/form/qps/user');
    });

    test('aborts a hung API request at the configured timeout and reaches the DOM fallback', async () => {
        const page = buildPage();
        const fetchMock = jest.fn().mockImplementation(
            (_url, requestOptions) =>
                new Promise((_resolve, reject) => {
                    requestOptions.signal.addEventListener('abort', () => {
                        const error = new Error('The operation was aborted');
                        error.name = 'AbortError';
                        reject(error);
                    });
                })
        );
        const previousFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;
        page.evaluate.mockImplementation((evaluateFn, ...args) => evaluateFn(...args));
        jest.useFakeTimers();

        try {
            const logoutPromise = qseowLogout(page, logoutOptions, hubUserPageButton);
            await Promise.resolve();
            jest.advanceTimersByTime(QSEOW_LOGOUT_API_TIMEOUT_MS);

            await expect(logoutPromise).resolves.toBe(true);
            expect(page.goto).toHaveBeenCalledWith(logoutOptions.hubUrl, {
                waitUntil: 'networkidle2',
                timeout: logoutOptions.pageTimeout,
            });
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('operation was aborted')
            );
        } finally {
            jest.useRealTimers();
            globalThis.fetch = previousFetch;
        }
    });

    test('treats a navigation during the API request as a successful logout', async () => {
        const page = buildPage();
        page.evaluate.mockRejectedValue(
            new Error('Execution context was destroyed, most likely because of a navigation.')
        );

        await expect(qseowLogout(page, logoutOptions, hubUserPageButton)).resolves.toBe(true);

        expect(page.goto).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('falls back to the stable hub logout selector after a non-204 API response', async () => {
        const page = buildPage();
        page.evaluate.mockResolvedValue(400);

        await expect(qseowLogout(page, logoutOptions, hubUserPageButton)).resolves.toBe(true);

        expect(page.goto).toHaveBeenCalledWith(logoutOptions.hubUrl, {
            waitUntil: 'networkidle2',
            timeout: logoutOptions.pageTimeout,
        });
        expect(page.waitForSelector).toHaveBeenNthCalledWith(1, hubUserPageButton, {
            timeout: 15000,
        });
        expect(page.waitForSelector).toHaveBeenNthCalledWith(2, QSEOW_LOGOUT_BUTTON_SELECTOR, {
            timeout: 15000,
        });
        expect(page.logoutButton.click).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('HTTP 400'));
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('tries the legacy positional selector when the stable selector is unavailable', async () => {
        const page = buildPage();
        page.evaluate.mockResolvedValue(400);
        page.waitForSelector
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('stable selector missing'))
            .mockResolvedValueOnce(undefined);

        await expect(
            qseowLogout(page, logoutOptions, hubUserPageButton, legacyLogoutButton)
        ).resolves.toBe(true);

        expect(page.waitForSelector).toHaveBeenNthCalledWith(3, legacyLogoutButton, {
            timeout: 15000,
        });
        expect(page.logoutButton.click).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining('Stable hub logout selector failed')
        );
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('reports both logout paths without throwing when the fallback also fails', async () => {
        const page = buildPage();
        page.evaluate.mockRejectedValue(new Error('QPS unavailable'));
        page.goto.mockRejectedValue(new Error('hub unavailable'));

        await expect(qseowLogout(page, logoutOptions, hubUserPageButton)).resolves.toBe(false);

        const loggedErrors = logger.error.mock.calls.map(([message]) => String(message)).join('\n');
        expect(loggedErrors).toContain("both the proxy session API and the hub's user menu failed");
        expect(loggedErrors).toContain('--sense-version 2026-May');
        expect(loggedErrors).toContain('support@ptarmiganlabs.com');
        expect(logger.debug).toHaveBeenCalled();
    });
});

describe('qseowLogoutQuietly', () => {
    test('does nothing when the run never signed in', async () => {
        // Called from a finally that also runs when the sign-in itself failed. There is no
        // session to release then, and warning about it would be noise on top of the real
        // error the run is already reporting.
        await expect(
            qseowLogoutQuietly(undefined, logoutOptions, hubUserPageButton)
        ).resolves.toBeUndefined();
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('releases the session when there is a page to release it from', async () => {
        const page = buildPage();

        await qseowLogoutQuietly(page, logoutOptions, hubUserPageButton);

        expect(page.evaluate).toHaveBeenCalled();
    });

    test('returns quietly when logout fails, rather than failing the caller', async () => {
        // The caller is a finally. Whatever happens here must not replace the error the block
        // is already unwinding with.
        const page = buildPage();
        page.evaluate.mockRejectedValue(new Error('QPS unavailable'));
        page.goto.mockRejectedValue(new Error('hub unavailable'));

        await expect(
            qseowLogoutQuietly(page, logoutOptions, hubUserPageButton)
        ).resolves.toBeUndefined();
    });

    test('qseowLogout reports failure by returning false, never by throwing', async () => {
        // The reason the wrapper's catch is a contract guard rather than a live bug fix.
        // If this ever starts throwing, the catch stops being theoretical - which is exactly
        // why it is there.
        const page = buildPage();
        page.evaluate.mockRejectedValue(new Error('QPS unavailable'));
        page.goto.mockRejectedValue(new Error('hub unavailable'));

        await expect(qseowLogout(page, logoutOptions, hubUserPageButton)).resolves.toBe(false);
    });
});
