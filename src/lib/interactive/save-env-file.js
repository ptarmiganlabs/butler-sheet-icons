import { writeFile, chmod, stat, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatEnvFile } from './render-env-file.js';

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
    } catch {
        // Anything unreadable is treated as absent. The write that follows will
        // fail with its own error if the path is a directory or unwritable,
        // which says more than a guess made here would.
        return { exists: false };
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
        const previousBackup = await existing(backupPath);

        // Said plainly, with the evidence. "Are you sure?" on its own gives
        // someone nothing to be sure about.
        runtime.write(
            `\n${theme.style.error(`${path} already exists (${current.size} bytes, last changed ${current.modified.toISOString().slice(0, 16).replace('T', ' ')}).`)}\n`
        );
        runtime.write(
            `${theme.style.help(`Saving replaces the whole file - settings for other Butler Sheet Icons commands, or anything you put there yourself, will not survive. The current contents are copied to ${BACKUP_FILE} first${previousBackup.exists ? `, replacing the ${BACKUP_FILE} already there` : ''}.`)}\n`
        );

        const overwrite = await runtime.ask(
            { key: '_overwriteEnv', type: 'confirm' },
            { message: `Overwrite ${ENV_FILE}?`, default: false, theme }
        );

        if (!overwrite) {
            return { saved: false, path };
        }

        // Copied before anything is written, so a failure part-way through
        // leaves the backup already in place rather than nothing at all.
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

    await writeFile(path, formatEnvFile(commandPath, specs, answers, { includeSecrets }), 'utf8');

    if (includeSecrets) {
        // Best effort: a filesystem that cannot express these permissions is not
        // a reason to refuse to save, but it is a reason not to claim the file
        // is protected when it may not be.
        try {
            await chmod(path, 0o600);
        } catch {
            runtime.write(
                `${theme.style.error('Could not restrict permissions on the file. Check them yourself before leaving credentials in it.')}\n`
            );
        }
    }

    return {
        saved: true,
        path,
        includedSecrets: includeSecrets,
        backupPath: backedUp ? backupPath : undefined,
    };
};
