import { buildQseowCommand } from '../commands/qseow/index.js';
import { buildQscloudCommand } from '../commands/qscloud/index.js';
import { buildBrowserCommand } from '../commands/browser/index.js';
import { buildDoctorCommand } from '../commands/doctor/index.js';

/**
 * @typedef {object} LeafCommand
 * @property {string} path - Space-separated command path, e.g. `browser install`.
 * @property {import('commander').Command} command - The Commander command itself.
 */

/**
 * Every command that actually does something, with the path a user would type.
 *
 * Walking the builders is the only way to enumerate these. The namespaces are
 * not symmetrical: qscloud and browser register one file per leaf, while qseow
 * builds its single leaf inline off the namespace and exports no per-leaf
 * builder at all. A hand-maintained list would therefore have to be right about
 * a structure that is already inconsistent, and would drift the first time a
 * command was added.
 *
 * Both the registry guard and the round-trip test read this, so a new command
 * is covered by them from the moment it is registered rather than from the
 * moment someone remembers to add it somewhere.
 *
 * @returns {LeafCommand[]} Every leaf command, in registration order.
 */
export const everyLeafCommand = () => {
    const leaves = [];

    const walk = (command, path) => {
        if (command.commands.length === 0) {
            leaves.push({ path: path.join(' '), command });

            return;
        }

        for (const child of command.commands) {
            walk(child, [...path, child.name()]);
        }
    };

    for (const namespace of [
        buildQseowCommand(),
        buildQscloudCommand(),
        buildBrowserCommand(),
        buildDoctorCommand(),
    ]) {
        walk(namespace, [namespace.name()]);
    }

    return leaves;
};

/**
 * Look up one leaf command by its path.
 *
 * @param {string} path - Space-separated command path, e.g. `browser uninstall`.
 *
 * @returns {import('commander').Command} The command.
 *
 * @throws {Error} When no leaf command has that path.
 */
export const leafCommandAt = (path) => {
    const leaves = everyLeafCommand();
    const match = leaves.find((leaf) => leaf.path === path);

    if (!match) {
        throw new Error(
            `Interactive: no command "${path}". Known commands: ${leaves.map((leaf) => leaf.path).join(', ')}.`
        );
    }

    return match.command;
};

/**
 * Look up one leaf command by its path in a tree that has already been built - the live `program`.
 *
 * `leafCommandAt` walks the builders, which is right for the registry guard and the round-trip test:
 * they ask what core declares. A wizard about to ask questions needs something else - the command
 * as registered, because a build may have added options to it through the extension point
 * (issue #1159), and those exist on the live tree and nowhere else. The root is the acting
 * command's ancestor, so every caller that has a Commander command in hand can reach it.
 *
 * Matches a segment on the command's name or one of its aliases, as Commander itself would.
 *
 * @param {import('commander').Command} root - The root command, with everything registered on it.
 * @param {string} path - Space-separated command path, e.g. `qseow create-sheet-thumbnails`.
 *
 * @returns {import('commander').Command} The command.
 *
 * @throws {Error} When no command in `root` has that path.
 */
export const leafCommandIn = (root, path) => {
    let command = root;

    for (const segment of String(path).trim().split(/\s+/).filter(Boolean)) {
        const child = command.commands.find(
            (candidate) => candidate.name() === segment || candidate.aliases().includes(segment)
        );

        if (!child) {
            throw new Error(
                `Interactive: no command "${path}" under "${root.name()}" - "${segment}" is not a command of "${command.name()}".`
            );
        }

        command = child;
    }

    return command;
};
