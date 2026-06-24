import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger, isSea } from '../../globals.js';

const require = createRequire(import.meta.url);

// Mirror the globals.js behavior: prefer the real SEA helper when available,
// but fall back to a shim so Jest/Node-only contexts can still import this
// module without the experimental runtime being present.
let getSeaAsset;
try {
    ({ getAsset: getSeaAsset } = require('node:sea'));
} catch (error) {
    /**
     * Fallback SEA `getAsset` shim used when the `node:sea` module is not available
     * (i.e. in tests and plain Node.js runs). Always throws because SEA assets can
     * only exist in a SEA-built binary.
     *
     * @returns {never} Never returns; always throws.
     * @throws {Error} Always thrown because SEA assets are not available outside a SEA runtime.
     */
    getSeaAsset = () => {
        throw new Error('SEA asset requested outside SEA runtime.');
    };
}

/**
 * Loads the Enigma.js schema JSON for a given schema version.
 *
 * When running as a SEA binary, the schema is read from the embedded asset;
 * otherwise it is read from the local `node_modules/enigma.js/schemas` directory.
 *
 * @param {object} options - Configuration options.
 * @param {string} options.schemaversion - Desired Enigma.js schema version (e.g. `12.170.2`). Must be one of the supported versions.
 *
 * @returns {object} The parsed Enigma.js schema JSON, ready to be passed to `enigma.js`.
 */
export const getEnigmaSchema = (options) => {
    // Array of supported schema versions
    const supportedSchemaVersions = [
        '12.170.2',
        '12.612.0',
        '12.936.0',
        '12.1306.0',
        '12.1477.0',
        '12.1657.0',
        '12.1823.0',
        '12.2015.0',
    ];

    let qixSchemaJson;
    try {
        // Check if the specified schema version is supported
        if (!supportedSchemaVersions.includes(options.schemaversion)) {
            logger.error(`Unsupported schema version specified: ${options.schemaversion}`);

            // Show supported schema versions
            logger.error(`Supported schema versions: ${supportedSchemaVersions.join(', ')}`);

            logger.error(`Exiting...`);
            process.exit(1);
        }

        // Are we running as a packaged app?
        if (isSea) {
            // Load schema file
            qixSchemaJson = getSeaAsset(`enigma_schema_${options.schemaversion}.json`, 'utf8');
        } else {
            // No, we are running as native Node.js
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);

            const schemaFile = path.join(
                __dirname,
                `../../../node_modules/enigma.js/schemas/${options.schemaversion}.json`
            );
            const schemaFilePath = path.resolve(schemaFile);
            logger.debug(`Enigma.js schema file: ${schemaFilePath}`);

            qixSchemaJson = fs.readFileSync(schemaFilePath, 'utf8');
        }
    } catch (err) {
        logger.error(`Error when getting Enigma schema: ${err}`);
        process.exit(1);
    }

    const qixSchema = JSON.parse(qixSchemaJson);
    logger.debug(`Enigma.js schema: ${qixSchema}`);

    return qixSchema;
};
