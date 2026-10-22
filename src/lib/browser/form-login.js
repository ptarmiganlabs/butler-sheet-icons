import { sleep } from '../../globals.js';

/**
 * Names the page the browser is on - its address and title - for a message about it.
 *
 * Best effort: a page that cannot be asked (crashed, closed) is named as such rather than turning
 * the explanation of one failure into a second failure.
 *
 * @param {object} page - Puppeteer page instance.
 *
 * @returns {Promise<string>} E.g. `https://sense.example.com/sense/app/1 (title "Sales")`.
 */
const describePage = async (page) => {
    try {
        const title = await page.title();

        return `${page.url()}${title ? ` (title "${title}")` : ' (no title)'}`;
    } catch {
        return 'the page the browser is on';
    }
};

/**
 * Upper-cases the first character, so a clause written to follow a colon can open a sentence.
 *
 * @param {string} text - The clause.
 *
 * @returns {string} The same text, starting with a capital.
 */
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Signs in through a Qlik Sense login form, then asserts that it worked.
 *
 * QSEoW and Cloud authenticate the browser channel the same way - click the username field, type,
 * click the password field, type, screenshot, submit, wait for navigation - and differed only in
 * their three selectors and how the username is assembled. Those two login sequences were separate
 * copies, which is this repository's dominant defect source: a fix applied to one twin and not the
 * other. See ptarmiganlabs/butler-sheet-icons#1091 step 2 and #1087 phase 1.
 *
 * This is the `form` strategy, and for now the only one. #1087 adds `header`, `jwt` and `ticket`
 * behind the same shape, demand-driven; nothing here is built speculatively for them.
 *
 * @param {object} page - Puppeteer page instance, already on the login page.
 * @param {object} params - Everything that differs between platforms.
 * @param {object} params.selectors - `{ username, password, submit }` CSS selectors.
 * @param {string} params.username - The username to type, already in the platform's format.
 * @param {string} params.password - The password to type.
 * @param {number} params.pagewait - Seconds to settle after navigation.
 * @param {number} params.pageTimeout - Navigation timeout in milliseconds.
 * @param {string} params.screenshotPath - Where to write the credentials-entered screenshot.
 * @param {string} params.logPrefix - Log prefix, e.g. `'QSEOW APP'`.
 * @param {Function} params.ErrorClass - Platform error class to throw on failure.
 * @param {object} params.logger - Logger instance.
 * @param {string} params.noFormRemedy - What to suggest when there is no login form to fill in,
 *     worded as one possibility: it follows a statement of what the page actually was.
 * @param {string|null} [params.pageFailure] - The caller's description of an HTTP error the
 *     navigation ended on, if it did. Used only to explain a missing form.
 *
 * @returns {Promise<void>} Resolves once the page is authenticated.
 *
 * @throws {Error} An instance of `ErrorClass` when there is no login form to begin with, or the
 *     page is still the login form afterwards.
 */
export const formLogin = async (page, params) => {
    const {
        selectors,
        username,
        password,
        pagewait,
        pageTimeout,
        screenshotPath,
        logPrefix,
        ErrorClass,
        logger,
        noFormRemedy,
        pageFailure = null,
    } = params;

    // No form to fill in. Puppeteer's click looks the field up once and fails on the spot, so this
    // costs no time - it replaces "No element found for selector: #username-input" with what the
    // page actually was. Facts first: an already signed-in browser is one way to get here, but so
    // are an HTTP error page and a proxy that does not recognise the host name, and advice that
    // assumes the first would send the operator the wrong way for the others.
    if ((await page.$(selectors.username)) === null) {
        throw new ErrorClass(
            `${logPrefix}: no login form on the page - the username field (${selectors.username}) ` +
                `is not on ${await describePage(page)}, so there is nothing to type the ` +
                // An HTTP error explains itself, with its own causes; the remedy assumes the
                // page is the app, which an error page is not.
                `credentials into. ${pageFailure ? capitalise(pageFailure) : noFormRemedy}`
        );
    }

    // Enter credentials
    // User
    await page.click(selectors.username, {
        button: 'left',
        delay: 10,
    });
    await page.keyboard.type(username);

    // Pwd
    await page.click(selectors.password, {
        button: 'left',
        delay: 10,
    });
    await page.keyboard.type(password);

    await page.screenshot({ path: screenshotPath });

    // Click login button and wait for page to load
    await Promise.all([
        page.click(selectors.submit, {
            button: 'left',
            delay: 10,
        }),
        page.waitForNavigation({
            waitUntil: 'networkidle2',
            timeout: pageTimeout,
        }),
    ]);

    await sleep(pagewait * 1000);

    await assertAuthenticated(page, {
        selectors,
        logPrefix,
        ErrorClass,
        logger,
        situation: 'submitting the credentials and waiting for navigation',
        remedy:
            'Check the username and password supplied to BSI, and that the login page is the ' +
            'form this strategy expects.',
    });
};

/**
 * Fails the run if the browser is still sitting on the login form.
 *
 * Success used to be implicit: click, wait for navigation, carry on. When credentials are wrong -
 * or, once #1087 adds them, when a header or JWT is not accepted - the browser stays on the login
 * page, and BSI went on to screenshot it as though it were a sheet. That produced thumbnails of a
 * login form and reported the run as successful, which is the worst of both outcomes: the sheets
 * are wrong *and* nothing said so.
 *
 * The check is deliberately the plainest thing that distinguishes the two states: if the username
 * field the strategy just typed into is still on the page, the login did not take.
 *
 * Callers that never typed a credential use it too - `--skip-login`, on both platforms, asserts that
 * the session it was told to rely on is actually signed in, which is the path where an
 * unauthenticated browser is most likely and the one where this check is most trustworthy: nothing
 * here could have left a login form behind, so finding one means the skipped login was not there to
 * skip. On Cloud that session is a signed-in browser profile; on QSEoW it is a virtual proxy that
 * signs the browser in with Windows authentication.
 *
 * @param {object} page - Puppeteer page instance.
 * @param {object} params - Assertion parameters.
 * @param {object} params.selectors - `{ username }` at minimum.
 * @param {string} params.logPrefix - Log prefix, e.g. `'QSEOW APP'`.
 * @param {Function} params.ErrorClass - Platform error class to throw.
 * @param {object} params.logger - Logger instance.
 * @param {string} params.situation - What was tried, in the message's `not authenticated after …`.
 * @param {string} params.remedy - What the operator should check, appended to the message.
 *
 * @returns {Promise<void>} Resolves when the page is authenticated.
 *
 * @throws {Error} An instance of `ErrorClass`, naming what was tried and what it expected to see.
 */
export const assertAuthenticated = async (
    page,
    { selectors, logPrefix, ErrorClass, logger, situation, remedy }
) => {
    const loginFieldStillPresent = (await page.$(selectors.username)) !== null;

    if (!loginFieldStillPresent) {
        logger.debug(`${logPrefix}: authenticated after ${situation} - the login form is gone.`);
        return;
    }

    throw new ErrorClass(
        `${logPrefix}: not authenticated after ${situation}. The login form's username field ` +
            `(${selectors.username}) is still on the page, so the browser is on the login ` +
            `screen. Continuing would capture that screen as though it were a sheet. ${remedy}`
    );
};
