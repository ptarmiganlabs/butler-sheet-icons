import { InvalidArgumentError, Option } from 'commander';

/**
 * Validates that the provided CLI argument represents a non-negative integer within optional bounds.
 *
 * @param {string|number} value - Raw argument value supplied via Commander.
 * @param {object} [options] - Validation options.
 * @param {number} [options.min] - Minimum allowed integer value (inclusive). Defaults to `0`.
 * @param {number} [options.max] - Maximum allowed integer value (inclusive).
 * @param {string} [options.errorMessage] - Custom error message for invalid input.
 * @param {boolean} [options.returnNumber] - When true, return the parsed integer; otherwise return the original string. Defaults to `false`.
 *
 * @returns {string|number} Either the trimmed string or parsed integer, depending on `returnNumber`.
 *
 * @throws {InvalidArgumentError} When the input is not an integer or outside the configured boundaries.
 */
const parsePositiveInteger = (value, { min = 0, max, errorMessage, returnNumber = false } = {}) => {
    const stringValue = `${value}`.trim();
    const messageParts = [];
    if (min !== undefined) {
        messageParts.push(`>= ${min}`);
    }
    if (max !== undefined) {
        messageParts.push(`<= ${max}`);
    }
    const defaultMessage =
        errorMessage ||
        `Value must be an integer${messageParts.length ? ` ${messageParts.join(' and ')}` : ''}.`;

    if (!/^\d+$/.test(stringValue)) {
        throw new InvalidArgumentError(defaultMessage);
    }

    const parsed = Number.parseInt(stringValue, 10);

    if (
        Number.isNaN(parsed) ||
        (min !== undefined && parsed < min) ||
        (max !== undefined && parsed > max)
    ) {
        throw new InvalidArgumentError(defaultMessage);
    }

    return returnNumber ? parsed : stringValue;
};

/**
 * Builds a Commander `argParser` for a **variadic** integer option (`<number...>`).
 *
 * Commander has two ways of producing an array-valued option, and they are mutually
 * exclusive. Declaring the option variadic makes Commander collect the values itself -
 * but only for options with no `argParser`. The moment an `argParser` is attached,
 * Commander switches to calling that parser once per value, passing the accumulated
 * result so far as the second argument, and stores whatever the parser returns. A
 * parser that ignores that second argument therefore throws away everything collected
 * before it, and the option ends up holding a bare string instead of an array.
 *
 * That is not a harmless type difference: every consumer of these options asks
 * `.includes(iSheetNum.toString())`, and `String.prototype.includes` is substring
 * matching. `--exclude-sheet-number 12` left as the string `'12'` matches sheet 1 and
 * sheet 2 as well as sheet 12.
 *
 * This helper closes over the validation options and accumulates, so a variadic option
 * keeps its array while still validating each value.
 *
 * Values are kept as **strings**, matching `parsePositiveInteger`'s default, because
 * consumers compare them against `iSheetNum.toString()`.
 *
 * @param {object} [parseOptions] - Validation options forwarded to `parsePositiveInteger`.
 *
 * @returns {(value: string, previous?: string[]) => string[]} Parser suitable for `Option.argParser()`.
 *
 * @throws {InvalidArgumentError} When any single value is not a non-negative integer.
 *
 * @example
 * new Option('--exclude-sheet-number <number...>', '...')
 *     .argParser(collectPositiveIntegers({ errorMessage: 'Must be a non-negative integer.' }))
 */
const collectPositiveIntegers =
    (parseOptions = {}) =>
    (value, previous = []) => [...previous, parsePositiveInteger(value, parseOptions)];

/**
 * Commander `argParser` for a **variadic** app-id option (`<id...>`).
 *
 * Accumulates for the reason spelled out above `collectPositiveIntegers`: a variadic
 * option paired with a non-accumulating parser keeps only the last value, so
 * `--appid a b c` would yield `['c']`.
 *
 * It also splits on commas, which is not cosmetic. Commander wraps an environment
 * variable's value in a one-element array **without splitting it**, so
 * `BSI_QSEOW_CST_APP_ID=a,b,c` would otherwise become a single app whose id contains
 * commas. Every option in this codebase has an `.env()` binding, so the environment is a
 * first-class way to drive it and cannot be left broken. Commas are accepted on the
 * command line too, so the separator does not depend on where the value came from - app
 * ids are GUIDs, so a comma is never part of one.
 *
 * Empty entries are dropped, which makes a set-but-empty variable mean "none supplied"
 * rather than one app with a blank id.
 *
 * @param {string} value - One raw value supplied by Commander.
 * @param {string[]} [previous] - App ids accumulated so far.
 *
 * @returns {string[]} Every app id collected so far, including this value's.
 *
 * @example
 * new Option('--appid <id...>', '...').argParser(collectAppIds)
 */
const collectAppIds = (value, previous = []) => [
    ...previous,
    ...`${value}`
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
];

/**
 * Builds a Commander `argParser` for a **variadic** option limited to a fixed set of values.
 *
 * `.choices()` would do the validation on its own, and for a scalar option it should be used
 * instead. It is not enough here for two reasons, both of which this repo has already paid for:
 *
 * - **Commas.** Commander wraps an environment variable's value in a one-element array without
 *   splitting it, so `BSI_DOCTOR_C_AREA=browser,environment` would be one value named
 *   `browser,environment`, matching no choice and failing the command outright. `collectAppIds`
 *   solves the same problem for `--appid`.
 * - **Set-but-empty.** Commander runs `parseArg` on environment values too, so a bare
 *   `BSI_DOCTOR_C_AREA=` line in a unit file reaches this as `''`. Everywhere else in the CLI that
 *   means "unset"; under `.choices()` alone it is a hard error before any handler runs.
 *
 * Declare the option `.choices(values)` first - which is what puts the list in `--help` and turns
 * the wizard's question into a checkbox - and then `.argParser(collectChoices(values))` to replace
 * the parser it installed.
 *
 * @param {string[]} values - The permitted values.
 *
 * @returns {(value: string, previous?: string[]) => string[]} Parser for `Option.argParser()`.
 *
 * @throws {InvalidArgumentError} When any single value is not one of `values`.
 *
 * @example
 * new Option('--area <area...>', '...').choices(CHECK_AREAS).argParser(collectChoices(CHECK_AREAS))
 */
const collectChoices =
    (values) =>
    (value, previous = []) => {
        const entries = `${value}`
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);

        for (const entry of entries) {
            if (!values.includes(entry)) {
                throw new InvalidArgumentError(`Allowed choices are ${values.join(', ')}.`);
            }
        }

        return [...previous, ...entries];
    };

/**
 * The `--browser-cache-dir` option, for the commands that read or write the browser cache.
 *
 * A factory rather than a shared instance, because Commander stores parsed values on the
 * Option object and six commands cannot share one.
 *
 * Declared once for all of them on purpose. Where the browser lives is a property of the
 * machine, not of a command: the directory `browser install` writes to has to be the one
 * `create-sheet-thumbnails` reads from, so one environment variable is shared across commands
 * rather than following the per-command `BSI_BROWSER_I_*` convention. `BSI_BROWSER_PAGE_TIMEOUT`,
 * already shared by both thumbnail commands, is the precedent.
 *
 * Two things are deliberately absent:
 *
 * - **No `.default()`.** The default lives in the resolver, which has tiers below this one -
 *   `PUPPETEER_CACHE_DIR`, and a folder beside the executable for standalone builds. A
 *   Commander default would make the value always truthy and those tiers unreachable.
 * - **No `argParser`.** Commander runs `parseArg` on values that came from the environment too,
 *   so a validator rejecting the empty string would turn a bare `BSI_BROWSER_CACHE_DIR=` line in
 *   a unit file into a hard CLI error. Empty means unset, which is what
 *   `PUPPETEER_EXECUTABLE_PATH=""` has always meant to Docker users, and the resolver trims and
 *   ignores it.
 *
 * @returns {Option} A new `--browser-cache-dir` option.
 */
const buildBrowserCacheDirOption = () =>
    new Option(
        '--browser-cache-dir <directory>',
        'Directory where Butler Sheet Icons keeps downloaded browsers. Defaults to a "browser-cache" folder next to the Butler Sheet Icons executable for standalone builds, and to the .cache/puppeteer folder in the current user\'s home directory otherwise.'
    ).env('BSI_BROWSER_CACHE_DIR');

/**
 * The `--browser-executable-path` option, for the commands that launch a browser.
 *
 * A factory for the same reason as {@link buildBrowserCacheDirOption}: Commander stores parsed
 * values on the Option object, so commands cannot share one instance.
 *
 * The environment variable is shared across commands rather than per-command prefixed, because
 * where the browser is installed is a property of the machine, not of one command.
 *
 * Neither a `.default()` nor an `argParser`, for the reasons spelled out on the cache directory
 * option: the tiers below this one live in the resolver, and Commander runs `parseArg` on
 * environment values too, so rejecting the empty string would turn `PUPPETEER_EXECUTABLE_PATH=""`
 * - a documented Docker idiom - into a hard CLI error.
 *
 * @returns {Option} A new `--browser-executable-path` option.
 */
const buildBrowserExecutablePathOption = () =>
    new Option(
        '--browser-executable-path <path>',
        'Full path to a browser executable to use, for example a Microsoft Edge or Google Chrome already installed on this machine. Butler Sheet Icons then neither downloads nor manages a browser. Takes precedence over PUPPETEER_EXECUTABLE_PATH. If the file does not exist the run stops rather than downloading a browser instead.'
    ).env('BSI_BROWSER_EXECUTABLE_PATH');

export {
    parsePositiveInteger,
    collectPositiveIntegers,
    collectAppIds,
    collectChoices,
    buildBrowserCacheDirOption,
    buildBrowserExecutablePathOption,
};
