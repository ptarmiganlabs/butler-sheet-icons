// filepath: /Users/goran/code/butler-sheet-icons/src/__tests__/butler-sheet-icons.test.js
import { test, expect, describe, jest, beforeEach, afterEach } from '@jest/globals';
import 'dotenv/config';
import { Command } from 'commander';
import { logger } from '../globals.js';
import childProcess from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock all the imported modules that are used in the main file
jest.mock('../globals.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
    },
    appVersion: '1.0.0-test',
}));

jest.mock('../lib/qseow/qseow-create-thumbnails.js', () => ({
    qseowCreateThumbnails: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/cloud/cloud-create-thumbnails.js', () => ({
    qscloudCreateThumbnails: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/cloud/cloud-collections.js', () => ({
    qscloudListCollections: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/cloud/cloud-remove-sheet-icons.js', () => ({
    qscloudRemoveSheetIcons: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/browser/browser-installed.js', () => ({
    browserInstalled: jest.fn().mockResolvedValue([]),
}));

jest.mock('../lib/browser/browser-uninstall.js', () => ({
    browserUninstall: jest.fn().mockResolvedValue(true),
    browserUninstallAll: jest.fn().mockResolvedValue(true),
}));

jest.mock('../lib/browser/browser-list-available.js', () => ({
    browserListAvailable: jest.fn().mockResolvedValue([]),
}));

// Helper function to execute the CLI with arguments
const execCLI = (args = []) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const cliPath = path.resolve(__dirname, '../butler-sheet-icons.js');

    // Execute the CLI script with the provided arguments
    const result = childProcess.spawnSync('node', [cliPath, ...args], {
        encoding: 'utf-8',
        env: process.env,
    });

    return result;
};

describe('butler-sheet-icons CLI', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    test('should show version info', () => {
        const result = execCLI(['--version']);
        // We don't need to check the exact version, just that it doesn't error
        expect(result.status).toBe(0);
    });

    test('should show help info', () => {
        const result = execCLI(['--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage:');
        expect(result.stdout).toContain('Options:');
        expect(result.stdout).toContain('Commands:');
    });

    test('should handle qseow create-sheet-thumbnails command', () => {
        // Since we don't want to actually run the command and we've mocked all the dependencies,
        // we'll test that the command is registered correctly
        const result = execCLI(['qseow', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('create-sheet-thumbnails');
    });

    test('should handle qscloud create-sheet-thumbnails command', () => {
        const result = execCLI(['qscloud', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('create-sheet-thumbnails');
    });

    test('should handle qscloud list-collections command', () => {
        const result = execCLI(['qscloud', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('list-collections');
    });

    test('should handle qscloud remove-sheet-icons command', () => {
        const result = execCLI(['qscloud', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('remove-sheet-icons');
    });

    test('should handle browser list-installed command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('list-installed');
    });

    test('should handle browser uninstall command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('uninstall');
    });

    test('should handle browser uninstall-all command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('uninstall-all');
    });

    test('should handle browser install command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('install');
    });

    test('should handle browser list-available command', () => {
        const result = execCLI(['browser', '--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('list-available');
    });
});
