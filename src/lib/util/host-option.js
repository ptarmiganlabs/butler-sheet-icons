import { InvalidArgumentError } from 'commander';

/** The two schemes an administrator plausibly pastes in front of a Sense host. */
const HTTP_SCHEME = /^https?:/i;

/** Any other `scheme://`, which is a mistake worth naming rather than guessing at. */
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Builds a Commander `argParser` that reduces a pasted URL to the bare host the
 * rest of the codebase expects, and refuses anything that is not one host.
 *
 * This exists because `--tenanturl` and `--host` are read by two families of code
 * that disagree about the value's shape, and nothing used to normalise it between
 * the option and either of them (issue #1148):
 *
 * - **Tolerant.** `QlikSaas` prepends `https://` only when it is missing, so a
 *   scheme-ful tenant url passes through and works. Every Cloud REST call goes
 *   through it - the connection test, the app list, the collection list, the media
 *   library upload.
 * - **Intolerant.** `setupEnigmaConnection` and the app-url builders on both
 *   platforms assume a bare host and prepend the scheme themselves. Given
 *   `https://tenant.eu.qlikcloud.com` they produce `wss://https://tenant…` and
 *   `https://https://tenant…`, and `ws` then resolves a host literally called
 *   `https` - reported as `getaddrinfo ENOTFOUND https`, which names neither the
 *   option nor the value.
 *
 * The split is what made this expensive to diagnose rather than merely wrong: the
 * pre-flight is all REST, so a scheme-ful value was confirmed with a green tick and
 * then failed several steps later.
 *
 * **Normalising at the option covers every way a value arrives.** Commander runs
 * `parseArg` on command-line values and on environment variables, and the wizard
 * runs it too - as the prompt's validator, and again when `answersToOptions` hands
 * the answers to a real `parseOptions()`. Normalising at the consumers instead
 * would mean the same rule in five places, which is how #476 came to be fixed in
 * the REST client alone while the help text promised both forms for all of them.
 *
 * **Parsed with `URL`, not with a regex.** A host is the part of a URL between
 * the scheme and the first `/`, and the platform's URL parser already knows where
 * the port, the path, the query, the fragment and any embedded credentials start.
 * Two hand-written regexes knew about the scheme and a trailing slash and let
 * everything else through - `https://host:8443` became the host `host:8443`, and
 * the engine url `wss://host:8443:4747/…` failed exactly as #1148 had. A value
 * with no scheme is parsed as if it had `https://`, which is what makes a bare
 * host and a protocol-relative `//host` both work.
 *
 * **Anything beyond the host is refused, not stripped**, because each of those
 * parts has somewhere else to go and dropping it silently produces a run that
 * fails late and far from the cause:
 *
 * - A *path* may be a virtual proxy prefix, which has its own option, and
 *   reducing `https://sense.example.com/form/hub` to `sense.example.com` would
 *   leave QSEoW authenticating and then failing ninety seconds later on a
 *   selector that says nothing about a prefix - the failure
 *   `normalizeVirtualProxyPrefix` was written to prevent.
 * - A *port* collides with `--port`, `--engineport` and `--qrsport`, all of which
 *   are appended to the host by their consumers.
 * - *Credentials* (`user:password@host`) have their own options, and a host that
 *   carried them would put a password into every log line that prints the host -
 *   the log redactor recognises embedded credentials only behind a scheme, and
 *   the scheme is exactly what this parser removes.
 *
 * None of the messages repeat the value. On the command line Commander already
 * quotes it, in the wizard it is on the line above, and a message that echoed a
 * value with credentials in it would be the leak the last point exists to avoid.
 *
 * **A blank value is refused too.** Both options this serves are mandatory with
 * no default, and Commander's missing-mandatory check does not catch a variable
 * that is set but empty - `BSI_QSEOW_CST_HOST=` in a unit file parses to `''` and
 * the run starts against nothing. Refusing it here names the option and, for a
 * variable, the variable. It also keeps the wizard honest: a prompt whose option
 * has a parser relies on that parser for its "required" check, and an empty host
 * would otherwise be accepted and the run pointed at `localhost`.
 *
 * @param {object} config - Parser configuration.
 * @param {string} config.example - A host to quote when refusing a value, in this
 *     platform's own vocabulary.
 * @param {string} [config.pathHint] - One extra sentence appended when a path is
 *     refused, naming where that part of the URL belongs instead.
 *
 * @returns {(value: string) => string} A Commander `argParser`. The host comes back
 *     as the URL parser spells it: lower-cased, and an internationalised name in
 *     its punycode form - which is the name DNS resolves either way.
 *
 * @throws {InvalidArgumentError} When the value is blank, is not a host name, uses a
 *     scheme other than http or https, or carries a port, a path, a query, a
 *     fragment or credentials.
 */
export const hostOptionParser =
    ({ example, pathHint = '' }) =>
    (value) => {
        const trimmed = String(value ?? '').trim();
        const enterTheHost = `Enter the host on its own, for example "${example}".`;

        if (trimmed === '') {
            throw new InvalidArgumentError(`Enter the host, for example "${example}".`);
        }

        // Checked before parsing: `new URL('ftp://x')` succeeds, and the mistake
        // would otherwise be reported as whatever the parse happened to find.
        if (!HTTP_SCHEME.test(trimmed) && OTHER_SCHEME.test(trimmed)) {
            throw new InvalidArgumentError(
                `Only "https://" and "http://" are recognised in front of a host. ${enterTheHost}`
            );
        }

        let url;
        try {
            // `https:sense.example.com` - one slash missing - is still an http(s)
            // value to the URL parser, which is why the test above is on the
            // scheme alone rather than on `scheme://`.
            url = new URL(HTTP_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
        } catch {
            throw new InvalidArgumentError(`That is not a host name. ${enterTheHost}`);
        }

        if (url.username !== '' || url.password !== '') {
            throw new InvalidArgumentError(
                `Credentials are not part of the host - the logon user and the API user have their own options. ${enterTheHost}`
            );
        }

        if (url.port !== '') {
            throw new InvalidArgumentError(
                `A port is not part of the host - the ports have their own options. ${enterTheHost}`
            );
        }

        // A trailing slash, or several, is part of the same paste as the scheme
        // and means nothing. Anything else after the host is a path.
        if (!/^\/*$/.test(url.pathname) || url.search !== '' || url.hash !== '') {
            throw new InvalidArgumentError(
                `${enterTheHost.slice(0, -1)} - a path is not part of it.${pathHint ? ` ${pathHint}` : ''}`
            );
        }

        return url.hostname;
    };
