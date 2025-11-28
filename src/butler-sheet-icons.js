import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { appVersion } from './globals.js';
import { buildQseowCommand } from './lib/commands/qseow/index.js';
import { buildQscloudCommand } from './lib/commands/qscloud/index.js';
import { buildBrowserCommand } from './lib/commands/browser/index.js';

const NODE_FLAG_FORWARD_ENV = 'BSI_NODE_FLAG_REINVOKED';
const supportedNodeFlags = new Set(['--trace-warnings', '--trace-deprecation', '--trace-uncaught']);

const splitNodeOptions = (value = '') => value.split(/\s+/u).filter(Boolean);

/**
 * Allow SEA binaries to respect Node tracing flags by reinvoking the CLI once with
 * NODE_OPTIONS populated. Without this Commander would reject flags such as
 * --trace-warnings that normally belong to the Node runtime.
 */
const ensureNodeFlagsApplied = () => {
    if (process.env[NODE_FLAG_FORWARD_ENV] === '1') {
        return;
    }

    const runtimeFlags = [];
    const filteredArgs = [];

    for (const arg of process.argv.slice(2)) {
        if (supportedNodeFlags.has(arg)) {
            runtimeFlags.push(arg);
        } else {
            filteredArgs.push(arg);
        }
    }

    if (runtimeFlags.length === 0) {
        return;
    }

    const existingFlags = splitNodeOptions(process.env.NODE_OPTIONS);
    const combinedFlags = [...new Set([...existingFlags, ...runtimeFlags])];

    // Log so users understand the apparent double-start of the CLI.
    console.info(
        `[BSI] Restarting CLI to honour Node.js runtime flag(s): ${runtimeFlags.join(', ')}`
    );

    const child = spawnSync(process.execPath, filteredArgs, {
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_OPTIONS: combinedFlags.join(' '),
            [NODE_FLAG_FORWARD_ENV]: '1',
        },
    });

    if (child.error) {
        console.error(
            `[BSI] Failed to re-run CLI with Node.js runtime flag(s): ${child.error.message}`
        );
        process.exitCode = 1;
        return;
    }

    process.exit(child.status ?? 1);
};

ensureNodeFlagsApplied();

const program = new Command();

/**
 * Top level async function.
 * Workaround to deal with the fact that Node.js doesn't currently support top level async functions.
 */
(async () => {
    program
        .version(appVersion)
        .name('butler-sheet-icons')
        .description(
            'This is a tool that creates thumbnail images based on the actual layout of sheets in Qlik Sense applications.\nQlik Sense Cloud and Qlik Sense Enterprise on Windows are both supported.\nThe created thumbnails are saved to disk and uploaded to the Sense app as new sheet thumbnail images.'
        );

    program.addCommand(buildQseowCommand());
    program.addCommand(buildQscloudCommand());
    program.addCommand(buildBrowserCommand());

    await program.parseAsync(process.argv);
})();
