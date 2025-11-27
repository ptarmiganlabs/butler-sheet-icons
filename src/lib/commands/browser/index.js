import { Command } from 'commander';
import { buildBrowserListInstalledCommand } from './list-installed.js';
import { buildBrowserUninstallCommand } from './uninstall.js';
import { buildBrowserUninstallAllCommand } from './uninstall-all.js';
import { buildBrowserInstallCommand } from './install.js';
import { buildBrowserListAvailableCommand } from './list-available.js';

/**
 * Builds the "browser" command namespace and wires up the install/list/uninstall sub-commands.
 *
 * @returns {import('commander').Command} Configured browser command tree.
 */
const buildBrowserCommand = () => {
    const browser = new Command('browser');

    browser.addCommand(buildBrowserListInstalledCommand());
    browser.addCommand(buildBrowserUninstallCommand());
    browser.addCommand(buildBrowserUninstallAllCommand());
    browser.addCommand(buildBrowserInstallCommand());
    browser.addCommand(buildBrowserListAvailableCommand());

    return browser;
};

export { buildBrowserCommand };
