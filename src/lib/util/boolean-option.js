import { InvalidArgumentError } from 'commander';

/**
 * Words administrators actually write for "off" in a unit file or a `.env`.
 */
const FALSE_WORDS = new Set(['false', '0', 'no', 'off']);

/** The matching set for "on", so an unrecognised value can be told from a deliberate one. */
const TRUE_WORDS = new Set(['true', '1', 'yes', 'on']);

/**
 * Parses the value of a flag that can also be set through an environment variable.
 *
 * This exists because of a trap in how Commander reads environment variables. For an option
 * declared with **no argument** - a bare `--skip-launch` - Commander sets the flag on the mere
 * presence of its variable and never looks at the value, so `BSI_BROWSER_C_SKIP_LAUNCH=false`
 * turned skip-launch **on**. On a diagnostic used as a deployment gate that inverted the result:
 * the gate passed having never started a browser.
 *
 * Declaring the argument optional (`--skip-launch [true|false]`) makes Commander pass the
 * variable's value through `argParser`, which is what this builds. Commander runs `argParser` on
 * command-line and environment values alike, so both spellings are judged the same way.
 *
 * A bare `--skip-launch` on the command line never reaches the parser: Commander stores boolean
 * `true` for an optional-argument option given without a value, which is why that keeps working.
 *
 * **An unrecognised value is refused, not guessed at.** Silently treating `--skip-launch oops` as
 * "off" cost the arity check that a no-argument flag used to provide: the flag *and* the stray
 * word both disappeared with no diagnostic, and the check ran as though neither had been typed.
 * Refusing is also what the repo already does for a malformed value - see `parsePositiveInteger`.
 *
 * `whenEmpty` is separate from that, because empty is not malformed. A bare `BSI_..._HEADLESS=`
 * line in a unit file means "unset" throughout this codebase - the same idiom as
 * `PUPPETEER_EXECUTABLE_PATH=""` - so each option says what its own unset value is, which is
 * normally its declared default.
 *
 * @param {object} [config] - Parser configuration.
 * @param {boolean} [config.whenEmpty] - What a set-but-empty value means for this option.
 *
 * @returns {(value: string|boolean) => boolean} A Commander `argParser`.
 */
export const booleanOptionParser =
    ({ whenEmpty = false } = {}) =>
    (value) => {
        if (typeof value === 'boolean') {
            return value;
        }

        const normalized = String(value ?? '')
            .trim()
            .toLowerCase();

        if (normalized === '') {
            return whenEmpty;
        }

        if (TRUE_WORDS.has(normalized)) {
            return true;
        }

        if (FALSE_WORDS.has(normalized)) {
            return false;
        }

        throw new InvalidArgumentError(
            `"${value}" is not a true/false value. Use one of: ${[...TRUE_WORDS].join(', ')} - or ${[...FALSE_WORDS].join(', ')}.`
        );
    };
