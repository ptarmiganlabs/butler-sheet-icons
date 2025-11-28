import { spawnSync as defaultSpawnSync } from 'node:child_process';

export const DEFAULT_SUPPORTED_NODE_FLAGS = new Set([
    '--trace-warnings',
    '--trace-deprecation',
    '--trace-uncaught',
]);

export const splitNodeOptions = (value = '') => value.split(/\s+/u).filter(Boolean);

/**
 * Re-invokes the CLI with runtime Node flags when necessary so SEA binaries behave like
 * `node --trace-warnings ./src/...`.
 *
 * @param {object} options
 * @param {string[]} [options.argv=[]] - Command-line args excluding `node` and script path.
 * @param {NodeJS.Process['env']} [options.env=process.env] - Environment variables.
 * @param {NodeJS.Process} [options.processRef=process] - Process-like object used for exit/execPath.
 * @param {typeof import('node:child_process').spawnSync} [options.spawnSyncFn=defaultSpawnSync]
 * @param {Set<string>} [options.supportedNodeFlags=DEFAULT_SUPPORTED_NODE_FLAGS]
 * @param {Console} [options.consoleRef=console]
 * @param {string} [options.nodeFlagForwardEnv='BSI_NODE_FLAG_REINVOKED']
 *
 * @returns {{reinvoked: boolean, reason?: string, exitStatus?: number, error?: Error}}
 */
export const ensureNodeFlagsApplied = ({
    argv = [],
    env = process.env,
    processRef = process,
    spawnSyncFn = defaultSpawnSync,
    supportedNodeFlags = DEFAULT_SUPPORTED_NODE_FLAGS,
    consoleRef = console,
    nodeFlagForwardEnv = 'BSI_NODE_FLAG_REINVOKED',
} = {}) => {
    if (env[nodeFlagForwardEnv] === '1') {
        return { reinvoked: false, reason: 'already-invoked' };
    }

    const runtimeFlags = [];
    const filteredArgs = [];

    for (const arg of argv) {
        if (supportedNodeFlags.has(arg)) {
            runtimeFlags.push(arg);
        } else {
            filteredArgs.push(arg);
        }
    }

    if (runtimeFlags.length === 0) {
        return { reinvoked: false, reason: 'no-flags' };
    }

    const existingFlags = splitNodeOptions(env.NODE_OPTIONS);
    const combinedFlags = [...new Set([...existingFlags, ...runtimeFlags])];

    consoleRef.info(
        `[BSI] Restarting CLI to honour Node.js runtime flag(s): ${runtimeFlags.join(', ')}`
    );

    const child = spawnSyncFn(processRef.execPath, filteredArgs, {
        stdio: 'inherit',
        env: {
            ...env,
            NODE_OPTIONS: combinedFlags.join(' '),
            [nodeFlagForwardEnv]: '1',
        },
    });

    if (child?.error) {
        consoleRef.error(
            `[BSI] Failed to re-run CLI with Node.js runtime flag(s): ${child.error.message}`
        );
        processRef.exit(1);
        return { reinvoked: false, reason: 'spawn-error', error: child.error };
    }

    const exitStatus = child?.status ?? 1;
    processRef.exit(exitStatus);
    return { reinvoked: true, exitStatus };
};
