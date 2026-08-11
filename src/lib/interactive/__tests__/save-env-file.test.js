import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { formatEnvFile, SECRET_PLACEHOLDER, quoteEnvValue } from '../render-env-file.js';
import { saveEnvFile, ENV_FILE, BACKUP_FILE } from '../save-env-file.js';
import { specsFromCommand } from '../option-introspect.js';
import { leafCommandAt } from '../command-tree.js';

const PATH = 'qscloud create-sheet-thumbnails';
const specs = () => specsFromCommand(leafCommandAt(PATH), { env: {} });

const ANSWERS = {
    tenanturl: 'acme.eu.qlikcloud.com',
    apikey: 'super-secret-key',
    appid: ['app-a', 'app-b'],
    imagedir: './shots',
};

let dir;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'bsi-env-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

/**
 * A runtime that answers the confirmations in order and records what it wrote.
 *
 * @param {boolean[]} answers - Answers to the confirmations, in order.
 *
 * @returns {object} A runtime plus the questions it was asked.
 */
const runtimeAnswering = (answers) => {
    const asked = [];
    const written = [];
    const queue = [...answers];

    return {
        asked,
        written,
        output: () => written.join(''),
        write: (text) => written.push(text),
        ask: async (spec) => {
            asked.push(spec.key);

            return queue.shift();
        },
    };
};

const theme = { style: { error: (t) => t, help: (t) => t } };

describe('formatEnvFile', () => {
    test('writes the environment variable each option declares', () => {
        const file = formatEnvFile(PATH, specs(), ANSWERS);

        // Quoted, because bare values are silently lossy - dotenv reads
        // everything after an unquoted '#' as a comment. See quoteEnvValue.
        expect(file).toContain("BSI_QSCLOUD_CST_TENANTURL='acme.eu.qlikcloud.com'");
        expect(file).toContain("BSI_QSCLOUD_CST_IMAGE_DIR='./shots'");
    });

    test('joins a variadic value with commas, not spaces', () => {
        // Commander wraps an environment variable in a one-element array without
        // splitting it, so a space-separated list would come back as one value.
        // Commas are what --appid's parser splits on - the trap #895 fixed.
        expect(formatEnvFile(PATH, specs(), ANSWERS)).toContain("APP_ID='app-a,app-b'");
    });

    test('leaves credentials out by default, with a placeholder and an explanation', () => {
        const file = formatEnvFile(PATH, specs(), ANSWERS);

        expect(file).not.toContain('super-secret-key');
        expect(file).toContain(SECRET_PLACEHOLDER);
        expect(file).toContain('deliberately not written');
    });

    test('writes credentials only when asked to', () => {
        const file = formatEnvFile(PATH, specs(), ANSWERS, { includeSecrets: true });

        expect(file).toContain('super-secret-key');
        expect(file).not.toContain(SECRET_PLACEHOLDER);
    });

    test('names the command it was written for', () => {
        expect(formatEnvFile(PATH, specs(), ANSWERS)).toContain(`butler-sheet-icons ${PATH}`);
    });
});

describe('a saved file reads back as what was saved', () => {
    // The property the module claims: a saved file reproduces the run, rather
    // than approximately reproducing it. Asserting substrings is not enough -
    // writing values bare passed every such test while dotenv silently
    // truncated `pass#word` to `pass`.
    const AWKWARD = {
        tenanturl: 'acme.eu.qlikcloud.com',
        apikey: 'pass#word',
        contentlibrary: 'Butler sheet thumbnails',
        imagedir: './img with spaces/',
        appid: ['app-a', 'app-b'],
    };

    test.each([
        ['a hash, which starts a comment when unquoted', 'apikey', 'pass#word'],
        ['surrounding spaces, which are otherwise stripped', 'imagedir', '  ./img  '],
        ['a double quote', 'apikey', 'pa"ss'],
        ['a single quote', 'apikey', "pa'ss"],
        ['a backslash', 'imagedir', String.raw`C:\Qlik\img`],
        ['an equals sign', 'apikey', 'a=b=c'],
        ['a newline', 'apikey', 'line1\nline2'],
    ])('survives %s', (_label, key, value) => {
        const file = formatEnvFile(
            PATH,
            specs(),
            { ...AWKWARD, [key]: value },
            {
                includeSecrets: true,
            }
        );
        const parsed = dotenv.parse(Buffer.from(file));
        const envVar = specs().find((spec) => spec.key === key).option.envVar;

        expect(parsed[envVar]).toBe(value);
    });

    test('a variadic value reads back as the same list', () => {
        const file = formatEnvFile(PATH, specs(), AWKWARD, { includeSecrets: true });
        const parsed = dotenv.parse(Buffer.from(file));

        expect(parsed.BSI_QSCLOUD_CST_APP_ID).toBe('app-a,app-b');
    });

    test('every written value reads back identically', () => {
        const file = formatEnvFile(PATH, specs(), AWKWARD, { includeSecrets: true });
        const parsed = dotenv.parse(Buffer.from(file));

        expect(parsed.BSI_QSCLOUD_CST_TENANTURL).toBe(AWKWARD.tenanturl);
        expect(parsed.BSI_QSCLOUD_CST_APIKEY).toBe(AWKWARD.apikey);
        expect(parsed.BSI_QSCLOUD_CST_CONTENT_LIBRARY ?? parsed.BSI_QSCLOUD_CST_IMAGE_DIR).toBe(
            AWKWARD.imagedir
        );
    });

    test('says so rather than lying when a value cannot be represented', () => {
        // A newline plus both quote characters has no faithful form in dotenv.
        // Writing something that reads back wrong is the failure being avoided.
        const impossible = `line1\nhas'both"quotes`;
        const file = formatEnvFile(
            PATH,
            specs(),
            { ...AWKWARD, apikey: impossible },
            {
                includeSecrets: true,
            }
        );

        expect(dotenv.parse(Buffer.from(file)).BSI_QSCLOUD_CST_APIKEY).toBeUndefined();
        expect(file).toContain('could not be written');
    });
});

describe('quoteEnvValue', () => {
    test('leaves a plain value readable rather than over-quoting', () => {
        expect(quoteEnvValue('chrome')).toBe("'chrome'");
    });

    test('gives up rather than corrupting the impossible case', () => {
        expect(quoteEnvValue(`a\nb'c"d`)).toBeUndefined();
    });
});

describe('saveEnvFile', () => {
    test('writes the file when none is there, asking only about credentials', async () => {
        const runtime = runtimeAnswering([false]);

        const result = await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        expect(result.saved).toBe(true);
        expect(runtime.asked).toEqual(['_saveSecrets']);
        expect(await readFile(join(dir, ENV_FILE), 'utf8')).toContain('BSI_QSCLOUD_CST_TENANTURL');
    });

    test('asks a second time before replacing a file that already exists', async () => {
        // The whole point of the extra confirmation: a .env in a working
        // directory holds settings for every command run from it, so replacing
        // it wholesale can destroy work unrelated to this wizard.
        await writeFile(join(dir, ENV_FILE), 'SOMETHING_ELSE=keep me\n', 'utf8');
        const runtime = runtimeAnswering([true, false]);

        await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        expect(runtime.asked).toEqual(['_overwriteEnv', '_saveSecrets']);
    });

    test('declining the overwrite leaves the existing file untouched', async () => {
        await writeFile(join(dir, ENV_FILE), 'SOMETHING_ELSE=keep me\n', 'utf8');
        const runtime = runtimeAnswering([false]);

        const result = await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        expect(result.saved).toBe(false);
        expect(await readFile(join(dir, ENV_FILE), 'utf8')).toBe('SOMETHING_ELSE=keep me\n');
    });

    test('keeps every setting the command does not own', async () => {
        // The whole point of merging. A .env holds settings for every Butler
        // Sheet Icons command run from that directory, plus whatever the
        // operator put there themselves; saving one command's answers must not
        // cost them the rest.
        await writeFile(
            join(dir, ENV_FILE),
            ['# my notes', 'BSI_QSEOW_CST_HOST=sense.acme.com', 'UNRELATED=keep me'].join('\n') +
                '\n',
            'utf8'
        );
        const runtime = runtimeAnswering([true, false]);

        await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        const after = await readFile(join(dir, ENV_FILE), 'utf8');
        expect(after).toContain('# my notes');
        expect(after).toContain('BSI_QSEOW_CST_HOST=sense.acme.com');
        expect(after).toContain('UNRELATED=keep me');
        expect(after).toContain("BSI_QSCLOUD_CST_TENANTURL='acme.eu.qlikcloud.com'");
    });

    test('updates a setting it owns rather than appending a second copy', async () => {
        await writeFile(join(dir, ENV_FILE), 'BSI_QSCLOUD_CST_TENANTURL=old.tenant\n', 'utf8');
        const runtime = runtimeAnswering([true, false]);

        const result = await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        const after = await readFile(join(dir, ENV_FILE), 'utf8');
        expect(after).not.toContain('old.tenant');
        expect(result.updated).toContain('BSI_QSCLOUD_CST_TENANTURL');
        expect(dotenv.parse(Buffer.from(after)).BSI_QSCLOUD_CST_TENANTURL).toBe(
            'acme.eu.qlikcloud.com'
        );
    });

    test('names how many settings will change rather than threatening the file', async () => {
        await writeFile(join(dir, ENV_FILE), 'UNRELATED=keep me\n', 'utf8');
        const runtime = runtimeAnswering([false]);

        await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        expect(runtime.output()).toContain('everything else in the file is left untouched');
    });

    test('copies the previous contents to .env.bak before replacing them', async () => {
        // Consenting to an overwrite should be recoverable, not final.
        await writeFile(join(dir, ENV_FILE), 'SOMETHING_ELSE=keep me\n', 'utf8');
        const runtime = runtimeAnswering([true, false]);

        const result = await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        expect(result.backupPath).toBe(join(dir, BACKUP_FILE));
        expect(await readFile(join(dir, BACKUP_FILE), 'utf8')).toBe('SOMETHING_ELSE=keep me\n');
        expect(await readFile(join(dir, ENV_FILE), 'utf8')).toContain('BSI_QSCLOUD_CST_TENANTURL');
    });

    test('writes no backup when there was nothing to back up', async () => {
        const runtime = runtimeAnswering([false]);

        const result = await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        expect(result.backupPath).toBeUndefined();
        await expect(stat(join(dir, BACKUP_FILE))).rejects.toThrow();
    });

    // Windows has no POSIX permission bits - Node reports 0o666 whatever the
    // file was created with - so this asserts something about the operating
    // system rather than about the code when it runs there.
    const posixOnly = process.platform === 'win32' ? test.skip : test;

    posixOnly('restricts permissions when credentials were written', async () => {
        const runtime = runtimeAnswering([true]);

        await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        const mode = (await stat(join(dir, ENV_FILE))).mode & 0o777;
        expect(mode).toBe(0o600);
    });

    test('reports whether credentials went in, so the caller can say so', async () => {
        const runtime = runtimeAnswering([false]);

        const result = await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        expect(result.includedSecrets).toBe(false);
    });
});
