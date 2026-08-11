import crypto from 'node:crypto';

import { logger, sleep } from '../../globals.js';

/** The stable selector for the Qlik Sense hub logout item. */
export const QSEOW_LOGOUT_BUTTON_SELECTOR =
    'xpath/.//*[@id="q-hub-menu-override"]//li[@tid="globalmenu-logout"]/span[2]';

/** Maximum time allowed for the browser-side QPS logout request. */
export const QSEOW_LOGOUT_API_TIMEOUT_MS = 30000;

const FALLBACK_SELECTOR_TIMEOUT = 15000;
const DEFAULT_PAGE_TIMEOUT = 90000;

/**
 * Builds the Qlik Proxy Service session endpoint for a virtual proxy.
 *
 * @param {string} [prefix] - Qlik Sense virtual proxy prefix.
 *
 * @returns {string} Relative QPS user-session path.
 */
const qpsUserPath = (prefix) => (prefix ? `/${prefix}/qps/user` : '/qps/user');

/**
 * Deletes the authenticated proxy session without depending on the Sense web client's DOM.
 *
 * @param {object} page - Puppeteer page holding the authenticated session.
 * @param {string} [prefix] - Qlik Sense virtual proxy prefix.
 * @param {number} timeoutMs - Maximum time to wait for the QPS response.
 *
 * @returns {Promise<number>} HTTP status returned by the QPS session endpoint.
 */
const logoutViaApi = async (page, prefix, timeoutMs) => {
    // QPS requires an xrfkey of exactly 16 characters, repeated in the header.
    const xrfKey = crypto.randomBytes(8).toString('hex');
    const path = qpsUserPath(prefix);

    return page.evaluate(
        async (logoutPath, key, requestTimeoutMs) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

            try {
                const response = await fetch(`${logoutPath}?xrfkey=${key}`, {
                    method: 'DELETE',
                    credentials: 'same-origin',
                    headers: { 'X-Qlik-Xrfkey': key },
                    signal: controller.signal,
                });

                return response.status;
            } finally {
                clearTimeout(timeoutId);
            }
        },
        path,
        xrfKey,
        timeoutMs
    );
};

/**
 * Logs out through the hub UI when the proxy session API cannot do so.
 *
 * @param {object} page - Puppeteer page holding the authenticated session.
 * @param {object} logoutOptions - Logout options.
 * @param {string} logoutOptions.hubUrl - URL of the Qlik Sense hub.
 * @param {number} logoutOptions.pageTimeout - Navigation timeout in milliseconds.
 * @param {number|string} logoutOptions.pagewait - Delay between browser actions in seconds.
 * @param {string} xpathHubUserPageButton - Version-specific user-menu button selector.
 * @param {string} legacyLogoutButton - Version-specific positional logout selector.
 *
 * @returns {Promise<void>} Resolves after the hub logout action has been clicked.
 */
const logoutViaHub = async (page, logoutOptions, xpathHubUserPageButton, legacyLogoutButton) => {
    const pageTimeout =
        logoutOptions.pageTimeout > 0 ? logoutOptions.pageTimeout : DEFAULT_PAGE_TIMEOUT;
    const pagewait = Number(logoutOptions.pagewait) > 0 ? Number(logoutOptions.pagewait) * 1000 : 0;

    await page.goto(logoutOptions.hubUrl, {
        waitUntil: 'networkidle2',
        timeout: pageTimeout,
    });

    await page.waitForSelector(xpathHubUserPageButton, {
        timeout: FALLBACK_SELECTOR_TIMEOUT,
    });
    const [userMenuButton] = await page.$$(xpathHubUserPageButton);

    await sleep(pagewait);
    await userMenuButton.click();

    try {
        await page.waitForSelector(QSEOW_LOGOUT_BUTTON_SELECTOR, {
            timeout: FALLBACK_SELECTOR_TIMEOUT,
        });
        const [logoutButton] = await page.$$(QSEOW_LOGOUT_BUTTON_SELECTOR);

        await sleep(pagewait);
        await logoutButton.click();
        await sleep(pagewait);
        return;
    } catch (err) {
        logger.info(
            `QSEOW: Stable hub logout selector failed: ${err?.message ?? err}; trying the legacy selector`
        );
        logger.debug(`QSEOW: Stable hub logout selector failure: ${err?.stack ?? err}`);
    }

    await page.waitForSelector(legacyLogoutButton, {
        timeout: FALLBACK_SELECTOR_TIMEOUT,
    });
    const [legacyLogout] = await page.$$(legacyLogoutButton);

    await sleep(pagewait);
    await legacyLogout.click();
    await sleep(pagewait);
};

/**
 * Ends the authenticated QSEoW browser session.
 *
 * The QPS API is preferred because it is independent of Sense web-client markup and of the
 * logged-in user's menu contents. The DOM path remains as a compatibility fallback for virtual
 * proxies or authentication modes where the browser-side DELETE is not accepted.
 *
 * @param {object} page - Puppeteer page holding the authenticated session.
 * @param {object} options - Logout options.
 * @param {string} [options.prefix] - Qlik Sense virtual proxy prefix.
 * @param {string} options.hubUrl - URL of the Qlik Sense hub.
 * @param {number} options.pageTimeout - Navigation timeout in milliseconds.
 * @param {number|string} options.pagewait - Delay between browser actions in seconds.
 * @param {string} options.senseVersion - Configured Qlik Sense release label.
 * @param {string} xpathHubUserPageButton - Version-specific user-menu button selector.
 * @param {string} legacyLogoutButton - Version-specific positional logout selector.
 *
 * @returns {Promise<boolean>} `true` when either logout path succeeds, otherwise `false`. Logout
 *     failure is nonfatal because thumbnail processing has already completed and the caller must
 *     still close the browser and release the engine session.
 */
export const qseowLogout = async (page, options, xpathHubUserPageButton, legacyLogoutButton) => {
    let apiStatus;

    try {
        apiStatus = await logoutViaApi(page, options.prefix, QSEOW_LOGOUT_API_TIMEOUT_MS);
        if (apiStatus === 204) {
            logger.verbose(`QSEOW: Logged out via QPS session API`);
            return true;
        }

        logger.info(`QSEOW: QPS logout returned HTTP ${apiStatus}, falling back to hub UI`);
    } catch (err) {
        if (err?.message?.includes('Execution context was destroyed')) {
            // Deleting the QPS session can cause the authenticated Sense page to redirect or unload
            // before the browser-side fetch promise can return its 204 status. At this point the
            // page navigation is the result of the logout, not a reason to try the now-invalid
            // hub session again.
            logger.verbose(`QSEOW: QPS logout triggered a browser navigation`);
            return true;
        }

        logger.info(`QSEOW: QPS logout failed: ${err?.message ?? err}; falling back to hub UI`);
        logger.debug(`QSEOW: QPS logout failure: ${err?.stack ?? err}`);
    }

    try {
        await logoutViaHub(page, options, xpathHubUserPageButton, legacyLogoutButton);
        logger.verbose(`QSEOW: Logged out through the hub user menu`);
        return true;
    } catch (hubError) {
        logger.info(`QSEOW: Legacy hub logout fallback failed: ${hubError?.message ?? hubError}`);
        logger.debug(`QSEOW: Legacy hub logout fallback failure: ${hubError?.stack ?? hubError}`);
        logger.error(
            `QSEOW: Could not log out of Qlik Sense - both the proxy session API and the hub's user menu failed.`
        );
        logger.error(
            `QSEOW: This usually means the Qlik Sense web client or proxy has changed and Butler Sheet Icons needs updating. You ran with --sense-version ${options.senseVersion}.`
        );
        logger.error(
            `QSEOW: Thumbnail generation completed, but logout was skipped. Processing will continue; if upload and sheet updates complete, only logout will have failed.`
        );
        logger.error(
            `QSEOW: Please report this to support@ptarmiganlabs.com or https://github.com/ptarmiganlabs/butler-sheet-icons/issues/new, including the Qlik Sense version and --sense-version value.`
        );
        return false;
    }
};
