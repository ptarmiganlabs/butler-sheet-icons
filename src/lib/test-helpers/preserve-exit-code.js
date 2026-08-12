/**
 * Keeps a test's `process.exitCode` out of Jest's own exit status.
 *
 * `runCommand` (src/lib/commands/run-command.js) sets `process.exitCode = 1` whenever a command
 * reports failure or throws, and deliberately does not rethrow - an operational failure such as an
 * unreachable server should not reach the `unhandledRejection` handler. That is right for the CLI
 * and a trap for the test suite: a test that exercises a failure path passes its assertions while
 * leaving `process.exitCode` set to 1 on the runner process. With `--runInBand` the tests share
 * that process, so Jest then exits 1 having reported every suite green.
 *
 * That is not hypothetical. Three describe blocks in `commands.test.js` did exactly this; the
 * `--forceExit` flag hid it for as long as it was set, because force-exiting calls
 * `process.exit(code)` with Jest's own status and overrides whatever a test left behind. Removing
 * the flag (issue #951) surfaced it immediately.
 *
 * Snapshotting around every test isolates that side effect the same way a restored mock isolates
 * any other global. The runner's exit status then comes from Jest's results, which is the only
 * thing that should decide it.
 */
import { beforeEach, afterEach } from '@jest/globals';

let savedExitCode;

beforeEach(() => {
    savedExitCode = process.exitCode;
});

afterEach(() => {
    process.exitCode = savedExitCode;
});
