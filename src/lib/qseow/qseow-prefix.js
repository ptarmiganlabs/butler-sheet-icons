/**
 * Normalises the Qlik Sense virtual proxy prefix given by `--prefix` / `BSI_QSEOW_CST_PREFIX`.
 *
 * The prefix is interpolated into URLs as `` `${origin}/${prefix}/sense/app/${appId}` ``, so a
 * value written with the slash the user sees in the browser address bar - `/form` rather than
 * `form` - produced a doubled separator:
 *
 *     https://sense.example.com//form/sense/app/<appid>
 *
 * That URL is not rejected. The Qlik proxy still redirects it to the right login page and the
 * login succeeds, so the run gets all the way to the first sheet before anything looks wrong -
 * and then fails with `Waiting for selector '#qv-page-container' failed` after a full 90 second
 * page timeout, naming a selector rather than the prefix that caused it. Reproduced on macOS and
 * Windows alike with `--prefix /form`, and fixed by `--prefix form`; the platform never mattered.
 *
 * Normalising rather than rejecting: `/form`, `form`, `form/` and `/form/` all name the same
 * virtual proxy, and an administrator copying the prefix out of a URL has done nothing wrong.
 *
 * @param {string|undefined|null} prefix - The prefix as supplied by the user.
 *
 * @returns {string} The prefix with surrounding whitespace and slashes removed. An empty string
 *   when there is no usable prefix, which is what callers treat as "no virtual proxy".
 *
 * @example
 * normalizeVirtualProxyPrefix('/form');   // 'form'
 * normalizeVirtualProxyPrefix('form/');   // 'form'
 * normalizeVirtualProxyPrefix('  ');      // ''
 */
export const normalizeVirtualProxyPrefix = (prefix) => {
    if (typeof prefix !== 'string') return '';

    // Trim whitespace before slashes so ' /form ' is handled, and collapse repeats at both ends
    // rather than a single character, so '//form//' normalises too.
    return prefix.trim().replace(/^\/+/, '').replace(/\/+$/, '').trim();
};
