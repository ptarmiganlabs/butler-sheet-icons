import { describe, it, expect, jest } from '@jest/globals';
import { ensureNodeFlagsApplied, DEFAULT_SUPPORTED_NODE_FLAGS } from '../ensure-node-flags.js';

const baseProcess = () => ({
    execPath: '/usr/bin/node',
    exit: jest.fn(),
    exitCode: undefined,
});

describe('ensureNodeFlagsApplied', () => {
    it('skips reinvocation when guard env is set', () => {
        const spawnMock = jest.fn();
        const processRef = baseProcess();

        const result = ensureNodeFlagsApplied({
            argv: ['--trace-warnings'],
            env: { BSI_NODE_FLAG_REINVOKED: '1' },
            processRef,
            spawnSyncFn: spawnMock,
            supportedNodeFlags: DEFAULT_SUPPORTED_NODE_FLAGS,
        });

        expect(result).toEqual({ reinvoked: false, reason: 'already-invoked' });
        expect(spawnMock).not.toHaveBeenCalled();
        expect(processRef.exit).not.toHaveBeenCalled();
    });

    it('reinvokes CLI with filtered args and merged NODE_OPTIONS', () => {
        const spawnMock = jest.fn().mockReturnValue({ status: 0 });
        const processRef = baseProcess();
        const consoleRef = { info: jest.fn(), error: jest.fn() };
        const env = {
            NODE_OPTIONS: '--trace-deprecation',
        };

        const result = ensureNodeFlagsApplied({
            argv: ['--trace-warnings', 'qseow', '--loglevel', 'debug'],
            env,
            processRef,
            spawnSyncFn: spawnMock,
            consoleRef,
            supportedNodeFlags: DEFAULT_SUPPORTED_NODE_FLAGS,
        });

        expect(result).toEqual({ reinvoked: true, exitStatus: 0 });
        expect(consoleRef.info).toHaveBeenCalledWith(
            '[BSI] Restarting CLI to honour Node.js runtime flag(s): --trace-warnings'
        );
        expect(spawnMock).toHaveBeenCalledTimes(1);
        expect(spawnMock.mock.calls[0][0]).toBe('/usr/bin/node');
        expect(spawnMock.mock.calls[0][1]).toEqual(['qseow', '--loglevel', 'debug']);

        const spawnEnv = spawnMock.mock.calls[0][2].env;
        expect(spawnEnv.NODE_OPTIONS).toBe('--trace-deprecation --trace-warnings');
        expect(spawnEnv.BSI_NODE_FLAG_REINVOKED).toBe('1');
        expect(processRef.exit).toHaveBeenCalledWith(0);
    });

    it('returns early when no node runtime flags are present', () => {
        const spawnMock = jest.fn();
        const processRef = baseProcess();

        const result = ensureNodeFlagsApplied({
            argv: ['qseow', '--help'],
            env: {},
            processRef,
            spawnSyncFn: spawnMock,
        });

        expect(result).toEqual({ reinvoked: false, reason: 'no-flags' });
        expect(spawnMock).not.toHaveBeenCalled();
        expect(processRef.exit).not.toHaveBeenCalled();
    });

    it('records spawn errors and sets exitCode without exiting', () => {
        const spawnError = new Error('spawn failed');
        const spawnMock = jest.fn().mockReturnValue({ error: spawnError });
        const processRef = baseProcess();
        const consoleRef = { info: jest.fn(), error: jest.fn() };

        const result = ensureNodeFlagsApplied({
            argv: ['--trace-warnings'],
            env: {},
            processRef,
            spawnSyncFn: spawnMock,
            consoleRef,
        });

        expect(result).toEqual({ reinvoked: false, reason: 'spawn-error', error: spawnError });
        expect(consoleRef.error).toHaveBeenCalledWith(
            `[BSI] Failed to re-run CLI with Node.js runtime flag(s): ${spawnError.message}`
        );
        expect(processRef.exit).toHaveBeenCalledWith(1);
    });
});
