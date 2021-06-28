const { Command, Option } = require('commander');
const { logger, appVersion, getLoggingLevel, setLoggingLevel } = require('./globals.js');

const { qseowCreateThumbnails } = require('./createthumbnails.js');

const program = new Command();

/**
 * Top level async function.
 * Workaround to deal with the fact that Node.js doesn't currently support top level async functions...
 */
(async () => {
  // Basic app info
  program
    .version(appVersion)
    .description(
      'This is a utility that creates thumbnail images based on the actual layout of sheets in Qlik Sense applications.\nThe created thumbnails are saved to disk and/or uploaded to the Sense app as new sheet thumbnail images.',
    );

  // Import dimensions/measures from definitions in Excel file
  program
    .command('create-qseow')
    .description(
      'create thumbnail images based on the layout of each sheet in a Qlik Sense Enterprise on Windows (QSEoW) application',
    )
    .action(async (options, command) => {
      logger.verbose('appid=' + options.appid);
      logger.verbose('itemid=' + options.itemid);
      qseowCreateThumbnails(options, command);
    })
    .option('--loglevel <level>', 'log level (error, warning, info, verbose, debug, silly)', 'info')
    .requiredOption('--host <host>', 'Qlik Sense server IP/FQDN')
    .requiredOption('--engineport <port>', 'Qlik Sense server engine port', '4747')
    .requiredOption('--qrsport <port>', 'Qlik Sense server repository service (QRS) port', '4242')
    .option('--port <port>', 'Qlik Sense http/https port. 443 is default for https, 80 for http')
    .requiredOption('--schemaversion <string>', 'Qlik Sense engine schema version', '12.612.0')
    .requiredOption('--appid <id>', 'Qlik Sense app whose master items should be modified')
    .requiredOption(
      '--certfile <file>',
      'Qlik Sense certificate file (exported from QMC)',
      './cert/client.pem',
    )
    .requiredOption(
      '--certkeyfile <file>',
      'Qlik Sense certificate key file (exported from QMC)',
      './cert/client_key.pem',
    )
    .requiredOption(
      '--rootcertfile <file>',
      'Qlik Sense root certificate file (exported from QMC)',
      './cert/root.pem',
    )
    .requiredOption('--prefix <prefix>', 'Qlik Sense virtual proxy prefix', '')
    .requiredOption('--secure <true|false>', 'connection to Qlik Sense engine is via https', true)
    .requiredOption(
      '--apiuserdir <directory>',
      'user directory for user to connect with when using Sense APIs',
    )
    .requiredOption(
      '--apiuserid <userid>',
      'user ID for user to connect with when using Sense APIs',
    )
    .requiredOption(
      '--logonuserdir <directory>',
      'user directory for user to connect with when logging into web UI',
    )
    .requiredOption(
      '--logonuserid <userid>',
      'user ID for user to connect with when logging into web UI',
    )
    .requiredOption('--logonpwd <password>', 'password for user to connect with')
    .requiredOption('--hosttype <type>', 'type of Qlik Sense server (qseow)', 'qseow')
    .option('--headless <true|false>', 'headless (=not visible) browser (true, false)', true)
    .option(
      '--pagewait <seconds>',
      'number of seconds to wait after moving to a new sheet. Set this high enough so the sheet has time to render properly',
      5,
    )
    .option(
      '--imagedir <directory>',
      'directory in which thumbnail images will be stored. Relative or absolute path',
      './img',
    )
    .requiredOption(
      '--contentlibrary <library-name>',
      'Qlik Sense content library to which thumbnails will be uploaded',
      'Butler sheet thumbnails',
    );

  // Parse command line params
  let a = await program.parseAsync(process.argv);
})();
