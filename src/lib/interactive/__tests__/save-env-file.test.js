import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatEnvFile, SECRET_PLACEHOLDER } from '../render-env-file.js';
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

        expect(file).toContain('BSI_QSCLOUD_CST_TENANTURL=acme.eu.qlikcloud.com');
        expect(file).toContain('BSI_QSCLOUD_CST_IMAGE_DIR=./shots');
    });

    test('joins a variadic value with commas, not spaces', () => {
        // Commander wraps an environment variable in a one-element array without
        // splitting it, so a space-separated list would come back as one value.
        // Commas are what --appid's parser splits on - the trap #895 fixed.
        expect(formatEnvFile(PATH, specs(), ANSWERS)).toContain('APP_ID=app-a,app-b');
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

    test('says what will be lost, rather than only asking whether to proceed', async () => {
        await writeFile(join(dir, ENV_FILE), 'SOMETHING_ELSE=keep me\n', 'utf8');
        const runtime = runtimeAnswering([false]);

        await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        expect(runtime.output()).toContain('already exists');
        expect(runtime.output()).toContain('will not survive');
        expect(runtime.output()).toContain('.env.bak');
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

    test('says when an existing backup is the one being replaced', async () => {
        // A second save would otherwise silently discard the backup of the
        // original file, which is the copy most worth keeping.
        await writeFile(join(dir, ENV_FILE), 'CURRENT=1\n', 'utf8');
        await writeFile(join(dir, BACKUP_FILE), 'OLDER=1\n', 'utf8');
        const runtime = runtimeAnswering([false]);

        await saveEnvFile({
            commandPath: PATH,
            specs: specs(),
            answers: ANSWERS,
            runtime,
            theme,
            cwd: dir,
        });

        expect(runtime.output()).toContain(`replacing the ${BACKUP_FILE} already there`);
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

    test('restricts permissions when credentials were written', async () => {
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
