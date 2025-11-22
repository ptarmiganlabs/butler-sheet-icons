# Butler Sheet Icons – QSEoW 2025-May Support

## Summary

- Added the new `2025-May` value to the `--sense-version` option for the `qseow` command in `src/butler-sheet-icons.js` and made it the default selection.
- Removed the incorrect `--sense-version` option from the `qscloud` command since Qlik Sense Cloud does not expose release buckets in the same way.
- Introduced dedicated XPath selectors (`xpathHubUserPageButton2025May` and `xpathLogoutButton2025May`) in `src/lib/qseow/qseow-process-app.js` so the automation can log out correctly on 2025-May hubs.
- Cleaned up a handful of unused `eslint-disable` directives the linter flagged while touching the files above.

## Manual Verification Notes

1. Deploy a QSEoW 2025-May test tenant matching production login flows.
2. Run `butler-sheet-icons qseow create-sheet-thumbnails --sense-version 2025-May ...` and confirm:
   - The CLI accepts the new version without warnings.
   - Screenshots are captured and uploaded as before.
   - Butler Sheet Icons is able to open the user menu and log out using the new XPath selectors.
3. Run `butler-sheet-icons qscloud create-sheet-thumbnails --help` and confirm the `--sense-version` option is no longer advertised.

## Follow-Up Ideas

- Extend the Jest coverage under `src/lib/qseow/__tests__` to assert the XPath mapping now that another release is supported.
- Propagate the `2025-May` support announcement to the public Butler Sheet Icons documentation site (separate repo) once this branch merges.
