<!--
PUBLISHED 2026-08-13 to the doc site `next` branch, PRs
ptarmiganlabs/butler-sheet-icons-docs#83 and #84.

Corrections made while publishing, none of them the draft's fault -- they were pre-existing errors
on the site that this draft exposed:

  - reference/supported-versions called --sense-version "mandatory". It is not, and it has a
    default: .choices(...).default(DEFAULT_QSEOW_SENSE_VERSION) with no makeOptionMandatory().
  - That page's table was missing 2024-Feb, an accepted value since March 2024 (commit dc932a3).
  - guide/configuration/qseow said "Critical: You must specify your QSEoW version".
  - guide/troubleshooting carried a hand-typed list of accepted values missing four of them.

The tested release is 2026-May **SR2**, not IR. #83 guessed IR from the surrounding rows and #84
corrected it. If a later draft needs to state the tested QSEoW release, get it from the user or the
server rather than inferring it from the table's existing rows.

The logout behaviour described below was verified verbatim against src/lib/qseow/qseow-logout.js.
-->

# QSEoW 2026-May support and browser logout

Butler Sheet Icons supports Qlik Sense Enterprise on Windows (QSEoW) 2026-May.

The `qseow create-sheet-thumbnails` command now uses `2026-May` when `--sense-version` is not
specified. This is the correct default for new QSEoW 2026-May installations.

## Older Qlik Sense versions

If your QSEoW server is older than 2026-May, set the version explicitly:

```text
butler-sheet-icons qseow create-sheet-thumbnails --sense-version 2025-Nov ...
```

The same setting can be supplied through the `BSI_QSEOW_CST_SENSE_VERSION` environment variable.

## Logout after thumbnail creation

After creating thumbnails, Butler Sheet Icons ends the Qlik Sense browser session through the Qlik
Proxy Service. This does not depend on the position of the logout item in the Sense user menu, so
changes to menu contents or user permissions are less likely to affect a run.

If the proxy-session request is not accepted, Butler Sheet Icons falls back to the Qlik Sense hub
user menu. It first looks for the stable logout hook and then tries the selector used by the
configured Sense version for older hub layouts. A logout problem does not discard thumbnails that
were already created; the browser and engine sessions are still closed and processing continues.

If both logout methods fail, the log includes the configured Sense version and asks you to report
the problem to `support@ptarmiganlabs.com` or through the Butler Sheet Icons issue tracker. Include
the complete logout error and the Qlik Sense release and service-release information.
