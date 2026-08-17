import { describe, test, expect, afterEach } from '@jest/globals';
import { isTimestampEnabled, LOG_TIMESTAMPS_ENV } from '../log-timestamps.js';

describe('isTimestampEnabled', () => {
    test('enabled when the variable is unset', () => {
        expect(isTimestampEnabled({})).toBe(true);
    });

    test('enabled when the variable is empty', () => {
        expect(isTimestampEnabled({ [LOG_TIMESTAMPS_ENV]: '' })).toBe(true);
    });

    // The same FALSE_WORDS vocabulary as booleanOptionParser, case-folded.
    test.each(['false', '0', 'no', 'off', 'FALSE', 'False', 'Off'])('disabled by "%s"', (value) => {
        expect(isTimestampEnabled({ [LOG_TIMESTAMPS_ENV]: value })).toBe(false);
    });

    // Values arrive dirty from real deployment routes: `docker run --env-file`
    // keeps the trailing \r of a CRLF .env, and cmd.exe keeps trailing spaces
    // from `set NAME=value `. Both must still disable.
    test.each(['false\r', ' false', 'false ', '\toff\t'])(
        'whitespace-wrapped %j still disables',
        (value) => {
            expect(isTimestampEnabled({ [LOG_TIMESTAMPS_ENV]: value })).toBe(false);
        }
    );

    // An unrecognised value keeps timestamps on: this runs during logger
    // construction, where refusing (as booleanOptionParser does) has nowhere
    // to report to, and silently losing timestamps would be worse.
    test.each(['true', '1', 'yes', 'on', 'anything'])(
        'unrecognised or affirmative value ("%s") leaves timestamps enabled',
        (value) => {
            expect(isTimestampEnabled({ [LOG_TIMESTAMPS_ENV]: value })).toBe(true);
        }
    );

    describe('default environment', () => {
        const hadValue = Object.prototype.hasOwnProperty.call(process.env, LOG_TIMESTAMPS_ENV);
        const savedValue = process.env[LOG_TIMESTAMPS_ENV];

        afterEach(() => {
            if (hadValue) {
                process.env[LOG_TIMESTAMPS_ENV] = savedValue;
            } else {
                delete process.env[LOG_TIMESTAMPS_ENV];
            }
        });

        test('reads process.env when no env is passed', () => {
            process.env[LOG_TIMESTAMPS_ENV] = 'false';
            expect(isTimestampEnabled()).toBe(false);

            delete process.env[LOG_TIMESTAMPS_ENV];
            expect(isTimestampEnabled()).toBe(true);
        });
    });
});
