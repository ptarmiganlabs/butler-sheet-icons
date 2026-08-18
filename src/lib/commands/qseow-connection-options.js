import { Option } from 'commander';

import { parsePositiveInteger } from './helpers.js';

/**
 * The engine schema versions the Enigma loader accepts.
 *
 * One list rather than a copy per command: the loader in `enigma-util.js`
 * throws for anything outside its own set, so a command advertising a version
 * the loader rejects fails at connect time with an error naming neither.
 */
const SCHEMA_VERSIONS = [
    '12.170.2',
    '12.612.0',
    '12.936.0',
    '12.1306.0',
    '12.1477.0',
    '12.1657.0',
    '12.1823.0',
    '12.2015.0',
];

/**
 * How a command reaches a Qlik Sense Enterprise on Windows server.
 *
 * Shared by `qseow create-sheet-thumbnails` and `qseow remove-sheet-icons`,
 * and shared for the reason `buildBrowserDiagnosticOptions` states about its
 * own list: two hand-maintained copies is how one of them quietly stops
 * matching. These eleven options were byte-identical across the two commands
 * apart from the environment stem, so a changed port default, a corrected
 * description or a new schema version had to be applied twice - and the
 * generated doc-site tables would have published whichever copy was stale.
 *
 * Deliberately **not** included, because they are not the same option on both
 * commands:
 *
 * - `--log-level`, whose variable is the unprefixed `BSI_LOG_LEVEL` on
 *   `create-sheet-thumbnails` and `BSI_QSEOW_RSI_LOG_LEVEL` on
 *   `remove-sheet-icons`. Env var names are a versioned part of the CLI
 *   surface, so the existing names stay as they are.
 * - `--port`, the hub's http/https port, which only the thumbnail command
 *   needs - it is the only one that opens the web UI.
 * - `--appid` and `--qliksensetag`, whose help text names what the command
 *   does to the apps it selects.
 *
 * Returned as a keyed set rather than the array `buildBrowserDiagnosticOptions`
 * returns, because the two commands do not declare these contiguously: the
 * thumbnail command puts `--port` between `--qrsport` and `--schemaversion`,
 * and `--prefix` after its app-selection options. Handing back named options
 * lets each command keep the exact order it already publishes - the help
 * output and the generated doc-site tables are unchanged by this extraction -
 * while still declaring each option once.
 *
 * @param {string} envPrefix - Per-command environment variable stem, e.g.
 *     `BSI_QSEOW_CST`. Each option below appends its own suffix to it.
 *
 * @returns {Record<string, Option>} New option instances, keyed by flag name.
 */
export const buildQseowConnectionOptions = (envPrefix) => ({
    host: new Option('--host <host>', 'Qlik Sense server IP/FQDN')
        .makeOptionMandatory()
        .env(`${envPrefix}_HOST`),

    engineport: new Option('--engineport <port>', 'Qlik Sense server engine port')
        .argParser((value) =>
            parsePositiveInteger(value, {
                errorMessage: 'Engine port must be a non-negative integer.',
            })
        )
        .default('4747')
        .makeOptionMandatory()
        .env(`${envPrefix}_ENGINE_PORT`),

    qrsport: new Option('--qrsport <port>', 'Qlik Sense server repository service (QRS) port')
        .argParser((value) =>
            parsePositiveInteger(value, {
                errorMessage: 'QRS port must be a non-negative integer.',
            })
        )
        .default('4242')
        .makeOptionMandatory()
        .env(`${envPrefix}_QRS_PORT`),

    schemaversion: new Option('--schemaversion <version>', 'Qlik Sense engine schema version')
        .choices(SCHEMA_VERSIONS)
        .default('12.612.0')
        .env(`${envPrefix}_SCHEMA_VERSION`),

    certfile: new Option('--certfile <file>', 'Qlik Sense certificate file (exported from QMC)')
        .default('./cert/client.pem')
        .makeOptionMandatory()
        .env(`${envPrefix}_CERT_FILE`),

    certkeyfile: new Option(
        '--certkeyfile <file>',
        'Qlik Sense certificate key file (exported from QMC)'
    )
        .default('./cert/client_key.pem')
        .makeOptionMandatory()
        .env(`${envPrefix}_CERTKEY_FILE`),

    rejectUnauthorized: new Option(
        '--rejectUnauthorized <true|false>',
        'Ignore warnings when Sense certificate does not match the --host paramater'
    )
        .default(false)
        .makeOptionMandatory()
        .env(`${envPrefix}_REJECT_UNAUTHORIZED`),

    secure: new Option('--secure <true|false>', 'Connection to Qlik Sense engine is via https')
        .default(true)
        .makeOptionMandatory()
        .env(`${envPrefix}_SECURE`),

    apiuserdir: new Option(
        '--apiuserdir <directory>',
        'User directory for user to connect with when using Sense APIs'
    )
        .makeOptionMandatory()
        .env(`${envPrefix}_API_USER_DIR`),

    apiuserid: new Option(
        '--apiuserid <userid>',
        'User ID for user to connect with when using Sense APIs'
    )
        .makeOptionMandatory()
        .env(`${envPrefix}_API_USER_ID`),

    prefix: new Option('--prefix <prefix>', 'Qlik Sense virtual proxy prefix')
        .default('')
        .makeOptionMandatory()
        .env(`${envPrefix}_PREFIX`),
});
