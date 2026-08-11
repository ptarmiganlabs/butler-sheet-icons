import { writeFile, stat, copyFile, rename, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatEnvFile, envAssignments } from './render-env-file.js';
import { mergeEnvContents } from './merge-env-file.js';

/** Where a saved file goes, relative to the working directory. */
export const ENV_FILE = '.env';

/** Where the previous contents are kept when one is replaced. */
export const BACKUP_FILE = '.env.bak';

/**
 * Read what is already at a path, if anything.
 *
 * @param {string} path - Absolute path to check.
 *
 * @returns {Promise<{exists: boolean, size?: number, modified?: Date}>} What is there.
 */
const existing = async (path) => {
    try {
        const info = await stat(path);

        return { exists: true, size: info.size, modified: info.mtime };
    } catch (err) {
        if (err?.code === 'ENOENT') {
            return { exists: false };
        }

        // Anything else - EACCES on the directory, a transient failure on a
        // network share - is not absence. Treating it as absence would skip both
        // the overwrite confirmation and the backup for a file that is really
        // there, which is the one case where those matter most.
        throw err;
    }
};

/**
 * Save answers to a `.env` file, asking twice before overwriting one.
 *
 * The second confirmation is not ceremony. A `.env` in a Butler Sheet Icons
 * working directory is where an administrator keeps the settings for *every*
 * command they run from it, so overwriting it wholesale can destroy work
 * unrelated to the wizard that is running. The file is replaced, not merged -
 * merging would mean parsing and rewriting someone else's file, and getting
 * that subtly wrong is worse than saying plainly what will happen.
 *
 * What is replaced is first copied to `.env.bak`, so consenting to the overwrite
 * is recoverable rather than final. One fixed name rather than a timestamp: a
 * predictable file is one an administrator can actually find and restore, where
 * an accumulating pile of dated backups in a working directory is litter nobody
 * reads. A previous `.env.bak` is therefore replaced in turn, which the
 * confirmation says out loud rather than leaving to be discovered.
 *
 * Secrets are a separate question again, defaulting to no, because a credential
 * on disk is a different decision from a set of ports and paths on disk. When
 * they are written the file is `chmod 600`, which is the only protection
 * available for a file the tool has just been asked to create.
 *
 * @param {object} args - Arguments.
 * @param {string} args.commandPath - Command the answers belong to.
 * @param {Array} args.specs - The questions asked.
 * @param {object} args.answers - Answers, keyed by spec key.
 * @param {object} args.runtime - Prompt runtime.
 * @param {object} args.theme - Prompt theme.
 * @param {string} [args.cwd] - Directory to write into. Injectable for tests.
 *
 * @returns {Promise<{saved: boolean, path: string, includedSecrets?: boolean, backupPath?: string}>}
 *     What happened, including where the previous contents went if there were any.
 */
export const saveEnvFile = async ({
    commandPath,
    specs,
    answers,
    runtime,
    theme,
    cwd = process.cwd(),
}) => {
    const path = resolve(cwd, ENV_FILE);
    const backupPath = resolve(cwd, BACKUP_FILE);
    const current = await existing(path);
    let backedUp = false;

    if (current.exists) {
        // Merged, not replaced. Only the settings this command owns change; every
        // other line - other commands' settings, comments, anything the operator
        // put there - is carried across byte for byte. So the question is no
        // longer "may I destroy this file" but the far smaller "may I change
        // these settings in it", and it names them.
        const names = envAssignments(specs, answers, { includeSecrets: false }).map(
            (entry) => entry.name
        );

        runtime.write(
            `\n${theme.style.help(`${path} already exists. ${names.length} setting(s) belonging to this command will be updated or added; everything else in the file is left untouched. A copy is kept in ${BACKUP_FILE} either way.`)}\n`
        );

        const proceed = await runtime.ask(
            { key: '_overwriteEnv', type: 'confirm' },
            { message: `Update ${ENV_FILE}?`, default: true, theme }
        );

        if (!proceed) {
            return { saved: false, path };
        }

        await copyFile(path, backupPath);
        backedUp = true;
    }

    const includeSecrets = await runtime.ask(
        { key: '_saveSecrets', type: 'confirm' },
        {
            message: 'Also write the credentials to the file?',
            default: false,
            theme,
        }
    );

    // Written to a temporary file and renamed over the target, rather than
    // written in place and chmod'd afterwards. Two reasons, both real: a file
    // created with the default umask and restricted a moment later is readable
    // by every account on the machine in between, and chmod cannot close that
    // window when the file already exists and keeps its old mode through the
    // write. Rename carries the temporary file's mode with it, so the
    // credentials never exist at a looser permission than they end at. It also
    // makes the replacement atomic: an interrupted save leaves the previous file
    // intact rather than a half-written one.
    const temporary = `${path}.tmp-${process.pid}`;

    let contents;
    let changed = { updated: [], added: [] };

    if (current.exists) {
        const existingText = await readFile(path, 'utf8');

        changed = mergeEnvContents(
            existingText,
            envAssignments(specs, answers, { includeSecrets })
        );
        contents = changed.contents;
    } else {
        contents = formatEnvFile(commandPath, specs, answers, { includeSecrets });
    }

    try {
        await writeFile(temporary, contents, {
            encoding: 'utf8',
            mode: includeSecrets ? 0o600 : 0o644,
        });
        await rename(temporary, path);
    } catch (err) {
        await rm(temporary, { force: true });

        throw err;
    }

    return {
        saved: true,
        path,
        includedSecrets: includeSecrets,
        backupPath: backedUp ? backupPath : undefined,
        updated: changed.updated,
        added: changed.added,
        superseded: changed.superseded ?? [],
    };
};
