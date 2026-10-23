import { jest } from '@jest/globals';

/**
 * A stand-in for what Puppeteer's `page.goto` resolves to.
 *
 * The QSEoW session reads the status of the page a navigation ended on - an HTTP error page has no
 * login form, and must not be mistaken for a signed-in one - so a mock `goto` has to answer with
 * something shaped like an `HTTPResponse`, not `true`.
 *
 * @param {number} [status] - HTTP status. Defaults to 200.
 * @param {string} [url] - Where the navigation ended.
 * @param {string} [statusText] - Reason phrase.
 *
 * @returns {object} An object with `ok()`, `status()`, `statusText()` and `url()`.
 */
export const httpResponse = (status = 200, url = '', statusText = '') => ({
    ok: () => status >= 200 && status <= 299,
    status: () => status,
    statusText: () => statusText,
    url: () => url,
});

/**
 * Make a mock Puppeteer page behave like a Qlik Sense login page.
 *
 * `formLogin` looks for the username field on both sides of the submit: before typing, to report a
 * page with no login form, and after the navigation, to report a login that did not take. A mock
 * whose `$` answers the same way every time can only satisfy one of those, so it models a browser
 * that was signed in before anyone typed - which is exactly the case `--skip-login` exists for.
 *
 * This keeps the page's state the way a real one does: every `goto` lands on the login form, and the
 * navigation that follows the submit leaves it behind. A page reused for a second session (the
 * after-capture) starts on the form again.
 *
 * Set `page._signedInAlready = true` to model `--skip-login`, where the proxy or profile signs the
 * browser in and no `goto` ever shows the form.
 *
 * @param {object} page - Mock page with `goto`, `waitForNavigation` and `$`. `$` should answer
 *     `null` for the username selector, which is what the page reports once signed in.
 * @param {string} usernameSelector - The platform's username field selector.
 *
 * @returns {object} The same page, with those three methods wrapped.
 */
export const withLoginForm = (page, usernameSelector) => {
    let onLoginForm = false;
    const { goto, waitForNavigation, $ } = page;

    page.goto = jest.fn((...args) => {
        onLoginForm = page._signedInAlready !== true;
        return goto(...args);
    });

    page.waitForNavigation = jest.fn((...args) => {
        onLoginForm = false;
        return waitForNavigation(...args);
    });

    page.$ = jest.fn((selector) =>
        selector === usernameSelector && onLoginForm ? Promise.resolve({}) : $(selector)
    );

    return page;
};
