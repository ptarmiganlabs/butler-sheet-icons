import { afterEach, describe, expect, test } from '@jest/globals';
import { spawn, spawnSync } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    realpathSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The macOS signing kit - scripts/sign-macos.sh and its keychain library - run where it can be:
// against stand-ins for Apple's tools, in a copy of the kit beside a stand-in binary.
//
// The kit only signs for real in a release, an insiders build or the signing canary, holding the
// Developer ID. Here it runs under /bin/bash, with security, codesign, ditto, xcrun, plutil and
// sleep replaced by the scripts in fixtures/apple-stand-ins/, which log what they are asked and do
// the least the kit needs. So the flow, the paths, the refusals and the teardown are checked on
// every pull request: under Linux's bash, and under the Mac's own /bin/bash 3.2, which the library
// is written for. Windows skips them. What the stand-ins cannot show is Apple's side, a real
// signature and a real notarization, and that is the signing canary's to show.
//
// Nothing in the first describe reaches the real security: the stand-ins come first on PATH, and
// the kit runs only from a copy. The last describe does use the real one, and so runs only on a
// GitHub-hosted Mac, which is thrown away after the job.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAND_INS = path.join(repoRoot, 'src', '__tests__', 'fixtures', 'apple-stand-ins');

// The shell the workflows' signing steps run the kit with.
const BASH = '/bin/bash';

// What a release's zip is called, as the workflow names it.
const ZIP = 'butler-sheet-icons-v9.9.9-macos-arm64.zip';

const IDENTITY = 'Developer ID Application: Somebody (TEAMID)';

const describeKit = process.platform === 'win32' ? describe.skip : describe;

// Removed after every test, kit and all.
const scratch = [];

afterEach(() => {
    for (const dir of scratch.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

/**
 * The non-empty lines of a file.
 *
 * @param {string} file - The file to read.
 *
 * @returns {string[]} Its lines.
 */
const lines = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean);

/**
 * A string, escaped to match itself in a regular expression.
 *
 * @param {string} text - The text to match.
 *
 * @returns {string} The pattern.
 */
const literally = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A copy of the kit with a built binary beside it, a user whose search list holds the keychains
 * given, and the stand-ins first on PATH.
 *
 * The folder is not called bsi-signing-anything: the library takes every path with that in it for
 * a keychain of its own, and would sweep the user's login keychain off the list as its debris. It is
 * a real path, not one through a link, because the script works out its own directory with `pwd`,
 * and the paths it passes to the stand-ins have to read as the test expects them to.
 *
 * @param {object} [options] - The user's keychains, and the certificate.
 * @param {string[]} [options.keychains] - File names in the user's keychain folder, the search list
 *     in that order.
 * @param {string[]} [options.dangling] - Names on the search list after those, with no file behind
 *     them.
 * @param {string} [options.certificate] - MACOS_CERTIFICATE, in base64.
 *
 * @returns {{root: string, home: string, log: string, searchList: string, keychains: string, runnerTemp: string, env: object}}
 *     Where everything is, and the environment to run the kit in.
 */
const makeKit = ({
    keychains = ['login.keychain-db'],
    dangling = [],
    certificate = Buffer.from('not a certificate').toString('base64'),
} = {}) => {
    const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'bsi-kit-')));

    scratch.push(dir);

    const root = path.join(dir, 'repository');

    mkdirSync(path.join(root, 'scripts', 'lib'), { recursive: true });

    for (const file of ['scripts/sign-macos.sh', 'scripts/lib/macos-signing-keychain.sh']) {
        cpSync(path.join(repoRoot, file), path.join(root, file));
    }

    cpSync(path.join(repoRoot, 'release-config'), path.join(root, 'release-config'), {
        recursive: true,
    });
    writeFileSync(path.join(root, 'butler-sheet-icons'), 'a built binary\n', { mode: 0o755 });

    const home = path.join(dir, 'home');
    const keychainFolder = path.join(home, 'Library', 'Keychains');

    mkdirSync(keychainFolder, { recursive: true });
    writeFileSync(path.join(keychainFolder, 'login.keychain-db'), '');

    for (const name of keychains) {
        writeFileSync(path.join(keychainFolder, name), '');
    }

    const searchList = path.join(dir, 'search-list');

    writeFileSync(
        searchList,
        [...keychains, ...dangling].map((name) => `${path.join(keychainFolder, name)}\n`).join('')
    );

    const runnerTemp = path.join(dir, 'runner-temp');
    const log = path.join(dir, 'log');

    mkdirSync(runnerTemp);
    writeFileSync(log, '');

    return {
        root,
        home,
        log,
        searchList,
        keychains: keychainFolder,
        runnerTemp,
        env: {
            PATH: `${STAND_INS}:/usr/bin:/bin`,
            HOME: home,
            RUNNER_TEMP: runnerTemp,
            LOG: log,
            FAKE_KEYCHAINS: searchList,
            MACOS_CERTIFICATE: certificate,
            MACOS_CERTIFICATE_PWD: 'p12-password',
            MACOS_CERTIFICATE_NAME: IDENTITY,
            PROD_MACOS_NOTARIZATION_APPLE_ID: 'somebody@example.com',
            PROD_MACOS_NOTARIZATION_TEAM_ID: 'TEAMID',
            PROD_MACOS_NOTARIZATION_PWD: 'app-specific-password',
        },
    };
};

/**
 * Runs the kit, or some other bash, to the end, in the kit's copy of the repository.
 *
 * Every argument is a constant, paths relative to the kit included: a path reaches bash through its
 * working directory or its environment, never on its command line. A temp-folder path on a shell's
 * command line is what CodeQL's js/shell-command-injection-from-environment flags.
 *
 * @param {object} kit - From makeKit.
 * @param {string[]} [args] - Arguments for bash, all of them constants. The signing script, with the
 *     binary and the zip a release passes it, when omitted.
 * @param {object} [env] - Variables to set beside the kit's.
 *
 * @returns {{code: (number|null), output: string}} The exit status, and stdout with stderr.
 */
const run = (
    kit,
    args = ['scripts/sign-macos.sh', './butler-sheet-icons', `./${ZIP}`],
    env = {}
) => {
    const result = spawnSync(BASH, args, {
        cwd: kit.root,
        env: { ...kit.env, ...env },
        encoding: 'utf8',
    });

    return { code: result.status, output: `${result.stdout}${result.stderr}` };
};

/**
 * Starts the kit in a process group of its own, as a workflow step runs, and sends that group a
 * signal once the kit is waiting on notarization, as cancelling the run does.
 *
 * @param {object} kit - From makeKit.
 * @param {string} signal - The signal to send.
 *
 * @returns {Promise<{code: (number|null), output: string}>} The exit status, and stdout with stderr.
 */
const signalDuringNotarization = async (kit, signal) => {
    const child = spawn(BASH, ['scripts/sign-macos.sh', './butler-sheet-icons', `./${ZIP}`], {
        cwd: kit.root,
        env: { ...kit.env, FAKE_NOTARY_SLEEP: '30' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
    });

    // Without a pid the group would be -0, and the signal would go to this process's own group:
    // the test runner.
    if (child.pid === undefined) {
        throw new Error(`${BASH} did not start`);
    }

    let output = '';
    let ended = false;

    child.stdout.on('data', (chunk) => {
        output += chunk;
    });
    child.stderr.on('data', (chunk) => {
        output += chunk;
    });

    const exited = new Promise((resolve) => {
        child.on('exit', (code) => {
            ended = true;
            resolve(code);
        });
    });
    const closed = new Promise((resolve) => {
        child.on('close', resolve);
    });

    /**
     * Waits a moment.
     *
     * @param {number} ms - How long.
     *
     * @returns {Promise<undefined>} Settles when the time is up.
     */
    const pause = (ms) =>
        new Promise((resolve) => {
            setTimeout(resolve, ms);
        });

    // The stand-in logs the submission, then sleeps in it. Waited for as long as the kit runs,
    // rather than for a time that a slow runner might not keep to.
    while (!readFileSync(kit.log, 'utf8').includes('xcrun notarytool submit')) {
        if (ended) {
            throw new Error(`the kit ended before it reached notarization:\n${output}`);
        }

        await pause(25);
    }

    // Sent again until the kit has exited, as a runner escalates a cancellation. The stand-in forks
    // its sleep just after it logs the submission, and a signal that lands in between misses the
    // sleep, which would then hold the kit's child, and with it the kit, for its whole thirty
    // seconds. The kit's trap is pending from the first signal either way; it runs once that child
    // has ended.
    let code;

    do {
        try {
            process.kill(-child.pid, signal);
        } catch {
            // The group is gone already; the exit below says how it ended.
        }

        code = await Promise.race([exited, pause(2000)]);
    } while (code === undefined);

    // Nothing of the group outlives the test, and its output is complete once the pipes close.
    try {
        process.kill(-child.pid, 'SIGKILL');
    } catch {
        // Nothing left of it.
    }

    await closed;

    return { code, output };
};

describeKit("the macOS signing kit, against stand-ins for Apple's tools", () => {
    test('signs, zips and notarizes, then leaves nothing of the signing behind', () => {
        const kit = makeKit();
        const { code, output } = run(kit);

        expect({ code, output }).toEqual({ code: 0, output: expect.any(String) });

        const calls = lines(kit.log);
        const keychain = calls
            .find((call) => call.startsWith('security create-keychain '))
            ?.split(' ')
            .at(-1);

        // In a folder of the run's own, under the runner's temp folder.
        expect(keychain).toMatch(
            new RegExp(
                `^${literally(kit.runnerTemp)}/bsi-signing\\.[^/]+/bsi-signing-\\d+\\.keychain-db$`
            )
        );
        expect(calls).toContain(
            `codesign --force -s ${IDENTITY} --keychain ${keychain} --identifier com.ptarmiganlabs.butler-sheet-icons -v ./butler-sheet-icons --deep --strict --options=runtime --timestamp --entitlements ${kit.root}/release-config/butler-sheet-icons.entitlements`
        );

        // Apple's CAs go into the signing keychain, rather than onto the machine.
        for (const ca of ['AppleIncRootCertificate.cer', 'DeveloperIDG2CA.cer']) {
            expect(calls).toContain(
                `security import ${kit.root}/release-config/apple-ca/${ca} -k ${keychain}`
            );
        }

        // The layout every macOS release has unpacked to, and the mode the binary was built with: a
        // umask set for the certificate and left on would publish a 700 binary.
        const mode = (statSync(path.join(kit.root, 'butler-sheet-icons')).mode & 0o777).toString(8);

        expect(calls).toContain(`staged: butler-sheet-icons/butler-sheet-icons=${mode} `);
        expect(existsSync(path.join(kit.root, ZIP))).toBe(true);
        expect(calls.find((call) => call.startsWith('xcrun notarytool submit '))).toBe(
            `xcrun notarytool submit ./${ZIP} --keychain-profile bsi-notarization --keychain ${keychain} --wait --timeout 20m --output-format json`
        );

        // Teardown: the run's folder gone, with the certificate, the keychain, the staging folder and
        // the notarization result in it; the search list as it was; and the default keychain never
        // written.
        expect(readdirSync(kit.runnerTemp)).toEqual([]);
        expect(existsSync(path.join(kit.root, 'certificate.p12'))).toBe(false);
        expect(lines(kit.searchList)).toEqual([path.join(kit.keychains, 'login.keychain-db')]);
        expect(
            calls.filter((call) => call.startsWith('security default-keychain -d user -s'))
        ).toEqual([]);
    });

    test.each([
        ['SIGHUP', 129],
        ['SIGINT', 130],
        ['SIGTERM', 143],
    ])(
        'ends at %s during notarization, running nothing after it, and still tears down',
        async (signal, status) => {
            const kit = makeKit();
            const { code, output } = await signalDuringNotarization(kit, signal);

            expect({ code, output }).toEqual({ code: status, output: expect.any(String) });

            const calls = lines(kit.log);

            expect(
                calls.filter(
                    (call) => call.startsWith('plutil') || call.startsWith('xcrun notarytool log')
                )
            ).toEqual([]);
            expect(calls.some((call) => call.startsWith('security delete-keychain'))).toBe(true);
            expect(readdirSync(kit.runnerTemp)).toEqual([]);
            expect(lines(kit.searchList)).toEqual([path.join(kit.keychains, 'login.keychain-db')]);
        },
        20_000
    );

    test('keeps a keychain whose path has a space on the search list', () => {
        const kit = makeKit({ keychains: ['login.keychain-db', 'Work Keychain.keychain-db'] });
        const { code, output } = run(kit);

        expect({ code, output }).toEqual({ code: 0, output: expect.any(String) });
        expect(lines(kit.searchList)).toEqual([
            path.join(kit.keychains, 'login.keychain-db'),
            path.join(kit.keychains, 'Work Keychain.keychain-db'),
        ]);
    });

    test("leaves other projects' entries alone, dangling ones included, and sweeps a stale one of its own", () => {
        // butler and ctrl-q make ~/Library/Keychains/build.keychain on a build Mac they may share,
        // put it on the search list and make it the default for their build. Other projects keep
        // signing keychains of their own on the list too. All of those are theirs, and so is an
        // entry whose file is gone: whichever project left it is the one to clear it. Only a
        // bsi-signing keychain, left by a run of this kit that never cleaned up, is this kit's.
        const kit = makeKit({
            keychains: [
                'login.keychain-db',
                'build.keychain-db',
                'other-signing-123.keychain-db',
                'bsi-signing-999.keychain-db',
            ],
            dangling: ['gone.keychain-db'],
        });
        const theirs = path.join(kit.keychains, 'build.keychain-db');
        const { code, output } = run(kit, undefined, { FAKE_DEFAULT_KEYCHAIN: theirs });

        expect({ code, output }).toEqual({ code: 0, output: expect.any(String) });
        expect(lines(kit.searchList)).toEqual([
            path.join(kit.keychains, 'login.keychain-db'),
            theirs,
            path.join(kit.keychains, 'other-signing-123.keychain-db'),
            path.join(kit.keychains, 'gone.keychain-db'),
        ]);
        expect(existsSync(theirs)).toBe(true);
        expect(
            lines(kit.log).filter((call) => call.startsWith('security default-keychain -d user -s'))
        ).toEqual([]);
    });

    test('never writes the default keychain, even one that points at nothing', () => {
        // The library used to point a default like this one at the login keychain. Whatever left it
        // so was not this kit, so the kit leaves it, and nothing it does needs a default at all.
        const kit = makeKit();
        const { code, output } = run(kit, undefined, {
            FAKE_DEFAULT_KEYCHAIN: path.join(kit.keychains, 'gone.keychain-db'),
        });

        expect({ code, output }).toEqual({ code: 0, output: expect.any(String) });
        expect(
            lines(kit.log).filter((call) => call.startsWith('security default-keychain'))
        ).toEqual(['security default-keychain -d user']);
    });

    test('writes back an empty search list, rather than leave the deleted keychain on it', () => {
        const kit = makeKit({ keychains: [] });
        const { code, output } = run(kit);

        expect({ code, output }).toEqual({ code: 0, output: expect.any(String) });
        expect(lines(kit.searchList)).toEqual([]);
    });

    test('refuses to sign when the search list cannot be read, and leaves the list as it was', () => {
        // A list that could not be read is not an empty one. Taken as empty, setup would put the
        // signing keychain on the list in place of the person's own, and teardown would then write
        // the empty snapshot back, taking the login keychain off their search list for good.
        const kit = makeKit();
        const { code, output } = run(kit, undefined, { FAKE_LIST_KEYCHAINS_FAILS: '1' });
        const calls = lines(kit.log);

        expect(code).not.toBe(0);
        expect(output).toMatch(/could not read the keychain search list/);
        expect(lines(kit.searchList)).toEqual([path.join(kit.keychains, 'login.keychain-db')]);
        expect(
            calls.filter((call) => call.startsWith('security list-keychains -d user -s'))
        ).toEqual([]);
        expect(
            calls.filter(
                (call) => call.startsWith('security create-keychain') || call.startsWith('codesign')
            )
        ).toEqual([]);
        expect(readdirSync(kit.runnerTemp)).toEqual([]);
    });

    test('never writes a search list it did not snapshot', () => {
        // Teardown runs whenever the script stops, before setup too, and an empty snapshot written
        // back then would wipe the person's list.
        const kit = makeKit();
        const { code, output } = run(kit, [
            '-c',
            '. scripts/lib/macos-signing-keychain.sh; bsi_keychain_teardown',
        ]);

        expect({ code, output }).toEqual({ code: 0, output: expect.any(String) });
        expect(lines(kit.log).filter((call) => call.startsWith('security list-keychains'))).toEqual(
            []
        );
        expect(lines(kit.searchList)).toEqual([path.join(kit.keychains, 'login.keychain-db')]);
    });

    test('leaves no certificate behind when it cannot be decoded', () => {
        const kit = makeKit({ certificate: '!!! this is not base64 !!!' });
        const { code } = run(kit);

        expect(code).not.toBe(0);
        expect(readdirSync(kit.runnerTemp)).toEqual([]);
        expect(existsSync(path.join(kit.root, 'certificate.p12'))).toBe(false);
    });

    test('keeps the passwords off the command lines that need not carry them', () => {
        // What `ps` could read, and for how long. The keychain password is made per run rather than
        // shared, the private key goes in non-extractable, and the notarization wait authenticates
        // from the keychain instead of from its own arguments.
        const kit = makeKit();
        const { code, output } = run(kit);
        const calls = lines(kit.log);

        expect({ code, output }).toEqual({ code: 0, output: expect.any(String) });
        expect(
            calls
                .filter((call) => call.includes('app-specific-password'))
                .map((call) => call.split(' ').slice(0, 3).join(' '))
        ).toEqual(['xcrun notarytool store-credentials']);

        for (const call of calls.filter((line) => /^xcrun notarytool (submit|log)/.test(line))) {
            expect(call).toMatch(/--keychain-profile bsi-notarization /);
            expect(call).not.toMatch(/--password/);
        }

        // The .p12 alone: the Apple CAs are imported too, and are certificates with no key.
        expect(
            calls.find(
                (call) => call.startsWith('security import ') && call.includes('certificate.p12')
            )
        ).toMatch(/ -x$/);

        // This run's own password, not a value from the environment, and the same one creates the
        // keychain, unlocks it and sets its partition list.
        const created = calls
            .find((call) => call.startsWith('security create-keychain '))
            .split(' ');
        const password = created[created.indexOf('-p') + 1];

        expect(password).toMatch(/^[0-9a-f]{48}$/);
        expect(
            calls.some(
                (call) => call.startsWith('security unlock-keychain') && call.includes(password)
            )
        ).toBe(true);
        expect(
            calls.some(
                (call) =>
                    call.startsWith('security set-key-partition-list') && call.includes(password)
            )
        ).toBe(true);
    });

    test('never writes through a certificate.p12 that something left in the repository', () => {
        // The build steps before the signing step run npm ci. A link left where the certificate used
        // to be decoded would have had the Developer ID key written wherever it pointed, and the
        // cleanup would then have removed only the link. The decode goes into a folder made for this
        // run, so the planted path is never opened at all.
        const kit = makeKit();
        const elsewhere = path.join(kit.home, 'elsewhere.p12');

        writeFileSync(elsewhere, '');
        symlinkSync(elsewhere, path.join(kit.root, 'certificate.p12'));

        const { code, output } = run(kit);

        expect({ code, output }).toEqual({ code: 0, output: expect.any(String) });
        expect(readFileSync(elsewhere, 'utf8')).toBe('');
    });

    test('refuses a binary that is a link, before it touches a keychain', () => {
        // The build writes the binary after npm ci, and codesign and cp both follow a link: one left
        // there would have whatever it points to signed, zipped and sent to Apple.
        const kit = makeKit();
        const key = path.join(kit.home, '.ssh', 'id_ed25519');
        const binary = path.join(kit.root, 'butler-sheet-icons');

        mkdirSync(path.dirname(key));
        writeFileSync(key, 'a private key\n');
        rmSync(binary);
        symlinkSync(key, binary);

        const { code, output } = run(kit);

        expect(code).toBe(1);
        expect(output).toMatch(/butler-sheet-icons is missing, or is not a regular file/);
        expect(lines(kit.log).filter((call) => call.startsWith('security'))).toEqual([]);
        expect(readdirSync(kit.runnerTemp)).toEqual([]);
    });

    test('refuses to write the zip through a link', () => {
        const kit = makeKit();
        const elsewhere = path.join(kit.home, 'elsewhere.zip');

        writeFileSync(elsewhere, '');
        symlinkSync(elsewhere, path.join(kit.root, ZIP));

        const { code, output } = run(kit);

        expect(code).toBe(1);
        expect(output).toMatch(/is a link\. Refusing to write the zip through it/);
        expect(readFileSync(elsewhere, 'utf8')).toBe('');
        expect(lines(kit.log).filter((call) => call.startsWith('security'))).toEqual([]);
    });

    test("reads Apple's verdict rather than notarytool's exit code, and prints Apple's log", () => {
        // The stand-in exits 0 whatever the status: notarytool's documentation does not promise
        // anything else for a submission Apple rejects.
        const kit = makeKit();
        const { code, output } = run(kit, undefined, { FAKE_NOTARY_STATUS: 'Invalid' });

        expect(code).toBe(1);
        expect(output).toMatch(/Notarization ended as 'Invalid'/);
        expect(
            lines(kit.log).some((call) =>
                call.startsWith(
                    'xcrun notarytool log submission-1 --keychain-profile bsi-notarization '
                )
            )
        ).toBe(true);
        expect(lines(kit.searchList)).toEqual([path.join(kit.keychains, 'login.keychain-db')]);
        expect(readdirSync(kit.runnerTemp)).toEqual([]);
    });

    test('signs on a second attempt when codesign stalls once', () => {
        const kit = makeKit();
        const failures = path.join(kit.home, 'codesign-failures');

        writeFileSync(failures, '1\n');

        const { code, output } = run(kit, undefined, { FAKE_CODESIGN_FAILURES: failures });

        expect({ code, output }).toEqual({
            code: 0,
            output: expect.stringMatching(/signed on attempt 2 in \d+s/),
        });
    });

    test('gives up after three failed attempts at signing, and still tears down', () => {
        const kit = makeKit();
        const failures = path.join(kit.home, 'codesign-failures');

        writeFileSync(failures, '3\n');

        const { code, output } = run(kit, undefined, { FAKE_CODESIGN_FAILURES: failures });
        const calls = lines(kit.log);

        expect(code).toBe(1);
        expect(output).toMatch(/codesign failed three times/);
        expect(calls.filter((call) => call.startsWith('codesign --force '))).toHaveLength(3);
        expect(calls.filter((call) => call.startsWith('xcrun notarytool submit'))).toEqual([]);
        expect(lines(kit.searchList)).toEqual([path.join(kit.keychains, 'login.keychain-db')]);
        expect(readdirSync(kit.runnerTemp)).toEqual([]);
    });
});

describe('the macOS build scripts', () => {
    // They run npm dependencies, so the secrets must never reach them: signing is
    // scripts/sign-macos.sh's, in a step of its own.
    test.each(['scripts/release-macos.sh', 'scripts/insider-build-mac.sh'])(
        '%s reads no signing secret and touches no keychain',
        (file) => {
            const code = readFileSync(path.join(repoRoot, file), 'utf8')
                .split('\n')
                .filter((line) => !/^\s*#/.test(line));

            expect(
                code.filter((line) => /MACOS_|NOTARIZATION|security|notarytool|keychain/.test(line))
            ).toEqual([]);
        }
    );
});

// The real security, which the stand-ins can only imitate: whether a path with a space in it, and an
// entry whose file is gone, survive the round trip through `security list-keychains` exactly. Only
// on a GitHub-hosted Mac, which is thrown away after the job: anywhere else this would be changing
// the search list of somebody's own machine.
const onHostedMac =
    process.platform === 'darwin' &&
    process.env.CI === 'true' &&
    process.env.RUNNER_ENVIRONMENT === 'github-hosted';

(onHostedMac ? describe : describe.skip)(
    'the keychain library, against the real security (GitHub-hosted Macs only)',
    () => {
        /**
         * Runs the real security.
         *
         * @param {string[]} args - Its arguments.
         *
         * @returns {{status: (number|null), stdout: string, stderr: string}} What it did.
         */
        const security = (args) => spawnSync('/usr/bin/security', args, { encoding: 'utf8' });

        /**
         * The search list security prints, as paths.
         *
         * @returns {string[]} The paths, in order.
         */
        const searchList = () =>
            security(['list-keychains', '-d', 'user'])
                .stdout.split('\n')
                .map((line) => line.trim().replace(/^"/, '').replace(/"$/, ''))
                .filter(Boolean);

        test('writes back a path with a space, and a dangling entry, exactly as it read them', () => {
            const original = searchList();
            const defaultBefore = security(['default-keychain', '-d', 'user']).stdout;
            const dir = realpathSync(
                mkdtempSync(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'bsi-kit-real-'))
            );
            const spaced = path.join(dir, 'Work Keychain.keychain-db');
            const planted = [...original, spaced, path.join(dir, 'gone.keychain-db')];

            try {
                expect(security(['create-keychain', '-p', 'test', spaced]).status).toBe(0);
                expect(security(['list-keychains', '-d', 'user', '-s', ...planted])).toMatchObject({
                    status: 0,
                });
                expect(searchList()).toEqual(planted);

                // The library is found from the working directory, and the folder for the
                // keychain arrives in the environment, so that the command line is a constant, as
                // run() keeps it.
                const setUpAndTearDown = spawnSync(
                    BASH,
                    [
                        '-c',
                        '. scripts/lib/macos-signing-keychain.sh; BSI_KEYCHAIN_DIR="$KEYCHAIN_DIR"; trap bsi_keychain_teardown EXIT; bsi_keychain_setup "$(od -An -tx1 -N24 /dev/urandom | tr -d " \\n")"',
                    ],
                    {
                        cwd: repoRoot,
                        encoding: 'utf8',
                        env: {
                            PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
                            HOME: os.homedir(),
                            KEYCHAIN_DIR: dir,
                        },
                    }
                );

                expect({
                    status: setUpAndTearDown.status,
                    output: `${setUpAndTearDown.stdout}${setUpAndTearDown.stderr}`,
                }).toEqual({ status: 0, output: expect.any(String) });
                expect(searchList()).toEqual(planted);
                expect(security(['default-keychain', '-d', 'user']).stdout).toBe(defaultBefore);
            } finally {
                security(['list-keychains', '-d', 'user', '-s', ...original]);
                security(['delete-keychain', spaced]);
                rmSync(dir, { recursive: true, force: true });
            }
        });
    }
);
