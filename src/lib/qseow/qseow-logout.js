import crypto from 'node:crypto';

import { logger, sleep } from '../../globals.js';
import { describeWithCauses } from '../util/log-error.js';
import { normalizeVirtualProxyPrefix } from './qseow-prefix.js';

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
const qpsUserPath = (prefix) => {
    const normalized = normalizeVirtualProxyPrefix(prefix);
    return normalized ? `/${normalized}/qps/user` : '/qps/user';
};

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

/**
 * Logs out without letting the attempt fail the caller.
 *
 * Mirrors `closeBrowserQuietly`. Two jobs, only one of which is load-bearing today.
 *
 * The load-bearing one is the `!page` guard: this is called from a `finally` that also runs
 * when the sign-in itself failed, and there is then no session to release.
 *
 * The `catch` is a guard on a contract, not a live bug. `qseowLogout` above reports both of
 * its failure paths and returns `false` rather than throwing, so today nothing reaches it.
 * It stays because this runs in a `finally`, where anything thrown replaces whatever the
 * block was already failing with - a logout error would bury the sheet-render error that
 * actually explains the run - and because that contract is a property of the function below,
 * not of the language.
 *
 * Logging out is what releases the Qlik Sense proxy session; closing the browser does not.
 * A session that is not released stays alive until it times out, and every stranded session
 * brings the user closer to their parallel-session limit, at which point Qlik Sense refuses
 * to open apps at all. That makes leaked sessions self-reinforcing: one failed run makes the
 * next one likelier to fail, and on a busy server it takes a service restart to clear.
 *
 * @param {object|undefined} page - Puppeteer page holding the session, if one was ever opened.
 * @param {object} logoutOptions - Options forwarded to `qseowLogout`.
 * @param {string} xpathHubUserPageButton - Hub user-menu selector for the fallback path.
 * @param {string} legacyLogoutButton - Legacy logout selector for the fallback path.
 *
 * @returns {Promise<void>} Always resolves.
 */
export const qseowLogoutQuietly = async (
    page,
    logoutOptions,
    xpathHubUserPageButton,
    legacyLogoutButton
) => {
    // No page means the run never got as far as signing in, so there is no session to release.
    if (!page) {
        return;
    }

    try {
        await qseowLogout(page, logoutOptions, xpathHubUserPageButton, legacyLogoutButton);
    } catch (err) {
        logger.warn(
            `QSEOW: Could not log the browser session out. It will stay active on the server until Qlik Sense times it out, which counts against the parallel-session limit for this user. ${describeWithCauses(err)}`
        );
    }
};
