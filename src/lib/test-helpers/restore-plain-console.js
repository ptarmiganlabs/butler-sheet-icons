/**
 * Lets integration-suite log output print plainly instead of wrapped in Jest's console frame.
 *
 * Winston's console transport writes through `console._stdout` when it exists
 * (node_modules/winston/lib/winston/transports/console.js:87). In a multi-suite run Jest installs
 * its BufferedConsole as the test-context `console`, and node's Console constructor points that
 * object's `_stdout` at Jest's capture buffer - so every Winston line is replayed by the reporter
 * wrapped in the interception frame: a `console.log` header plus
 * `at Console.log (node_modules/winston/lib/winston/transports/console.js:87:23)`. The origin is
 * always that same transport line, so the frame carries no information, and it triples the height
 * of the log output an integration run exists to show.
 *
 * Single-suite runs never show the problem, which makes it look intermittent: Jest auto-enables
 * verbose mode when exactly one suite is selected and then uses CustomConsole, whose `_stdout` is
 * the real stream, so Winston bypasses the buffer entirely.
 *
 * Giving integration suites a real Console bound to the process streams makes Winston - and direct
 * `console.log` calls - write straight through, in chronological order. Scoped to
 * `*.integration.test.js`: unit suites keep Jest's buffered console, whose per-test grouping,
 * informative origins, and `--silent` muting are worth having there.
 */
import { Console } from 'node:console';
import { expect } from '@jest/globals';

if (/\.integration\.test\.js$/.test(expect.getState().testPath ?? '')) {
    globalThis.console = new Console({ stdout: process.stdout, stderr: process.stderr });
}
