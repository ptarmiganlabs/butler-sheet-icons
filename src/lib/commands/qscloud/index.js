import { Command } from 'commander';
import { buildCloudCreateSheetThumbnailsCommand } from './create-sheet-thumbnails.js';
import { buildCloudListCollectionsCommand } from './list-collections.js';
import { buildCloudRemoveSheetIconsCommand } from './remove-sheet-icons.js';

/**
 * Builds the "qscloud" command namespace and attaches all related sub-commands.
 *
 * @returns {import('commander').Command} Command containing create, list and remove sheet sub-commands.
 */
const buildQscloudCommand = () => {
    const cloud = new Command('qscloud');

    cloud.addCommand(buildCloudCreateSheetThumbnailsCommand());
    cloud.addCommand(buildCloudListCollectionsCommand());
    cloud.addCommand(buildCloudRemoveSheetIconsCommand());

    return cloud;
};

export { buildQscloudCommand };
