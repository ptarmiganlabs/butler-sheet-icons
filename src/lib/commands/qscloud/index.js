import { Command } from 'commander';
import { buildCloudCreateSheetThumbnailsCommand } from './create-sheet-thumbnails.js';
import { buildCloudListCollectionsCommand } from './list-collections.js';
import { buildCloudRemoveSheetIconsCommand } from './remove-sheet-icons.js';

const buildQscloudCommand = () => {
    const cloud = new Command('qscloud');

    cloud.addCommand(buildCloudCreateSheetThumbnailsCommand());
    cloud.addCommand(buildCloudListCollectionsCommand());
    cloud.addCommand(buildCloudRemoveSheetIconsCommand());

    return cloud;
};

export { buildQscloudCommand };
