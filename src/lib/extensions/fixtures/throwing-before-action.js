/**
 * An extensions module whose `beforeAction` hook aborts the run, for testing what a deliberate
 * throw does to the process (issue #1150).
 *
 * Bundled over `#extensions` by the test that uses it; never part of a shipped build.
 *
 * @type {import('../../apply.js').SeamDescription}
 */
export const extensions = {
    seamVersion: 1,
    commands: [],
    options: [],
    hooks: {
        beforeAction: () => {
            throw new Error('beforeAction says no');
        },
    },
};
