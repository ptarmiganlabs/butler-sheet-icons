import { Command } from 'commander';
import { buildDoctorCheckCommand } from './check.js';

/**
 * Builds the "doctor" command namespace.
 *
 * `check` is registered as the default subcommand, so bare `butler-sheet-icons doctor` runs it.
 * That matters more than it looks: an administrator holding a failed run types the word they are
 * thinking of, and being answered with a usage error instead of a diagnosis is the moment the
 * command stops being worth having. The namespace still exists as a namespace because `analyze`
 * and `explain` join it later (§15.2).
 *
 * @returns {import('commander').Command} Configured doctor command tree.
 */
const buildDoctorCommand = () => {
    const doctor = new Command('doctor');

    doctor
        .description(
            'Run diagnostic checks against this machine and report what would stop Butler Sheet Icons working.'
        )
        // `isDefault` has a help cost that has to be paid back explicitly: Commander answers
        // `doctor --help` with the *namespace's* help - one subcommand, no options - so every
        // option of the command that bare `doctor` actually runs was invisible at exactly the
        // keystroke an administrator tries first. The namespace cannot inherit the subcommand's
        // help wholesale (it genuinely is a namespace, with more subcommands coming), so it says
        // where the options are instead.
        .addHelpText(
            'after',
            '\nBare "doctor" runs "doctor check". Its options - which areas to check, JSON output,\nallowing network access - are listed by:\n\n  butler-sheet-icons doctor check --help\n'
        );

    doctor.addCommand(buildDoctorCheckCommand(), { isDefault: true });

    return doctor;
};

export { buildDoctorCommand };
