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

    doctor.addCommand(buildDoctorCheckCommand(), { isDefault: true });

    return doctor;
};

export { buildDoctorCommand };
