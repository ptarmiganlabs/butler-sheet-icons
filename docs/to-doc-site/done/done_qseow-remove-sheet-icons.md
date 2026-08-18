<!--
PUBLISHED to `next` on 2026-08-18, butler-sheet-icons-docs PR #109. Version gate 5.0.0,
read from release-please PR #974 at publish time. Publishing this closed #1082.

NOT published as a new page. `docs/reference/qseow.md` already carried a `## remove-sheet-icons`
section - written before the command existed, which is what #1082 was filed for - so that section
was replaced rather than a second one added. Its claim that the command "uses the same connection
and authentication options as create-sheet-thumbnails" was wrong in the other direction and is
gone: the option set is deliberately narrower. `/guide/concepts/dry-run` was updated in the same
PR, since it said three commands accept the flag and described the `clear icon` column as
Cloud-only.

CORRECTION, and it changed twice. This draft says of no-icon sheets: "the real run reports them
the same way rather than failing over them". That was FALSE when published - the real run tested
for the thumbnail structure while the planner tested the URL, so a re-run rewrote and saved every
already-cleared sheet (#1113). The sentence was therefore left OUT of the published page. #1113
was then fixed in the same pull request that merged this draft (#1114), so the claim is now TRUE.
The live page still omits it; adding it back is a small, safe follow-up.
-->

# Removing sheet icons on Qlik Sense Enterprise on Windows

Butler Sheet Icons can now remove sheet icons from Qlik Sense Enterprise on Windows (QSEoW) apps, using the new `qseow remove-sheet-icons` command.

Until now this was only possible on Qlik Sense Cloud. QSEoW administrators who applied thumbnails to the wrong app had no supported way to undo it.

> **Publisher notes (not for the site):**
>
> 1. The doc site's QSEoW reference page (`docs/reference/qseow.md`) **already carries a `## remove-sheet-icons` section**, published ahead of the command existing — issue #1082. This draft supersedes it: verify that section against the implementation, replace its option table with the generated block below, and add the version gate. Publishing this closes #1082.
> 2. Version gate: read the open release-please PR title at publish time — do not trust any number written here. As of this draft the pending release was 5.0.0.
> 3. The demo pipeline records this command as one of its assets (`demo/cast/qseow-remove-sheet-icons.cast`, rendered by `npm run demo:render`); once rendered, the WebM belongs on this page. See the `demo-before-dry-run-after-narrative.md` draft.

::: warning Requires BSI (version gate - see publisher note)
This command does not exist in earlier versions. On those, running `butler-sheet-icons qseow remove-sheet-icons` prints the `qseow` help text and exits without doing anything, and the only way back was to clear each sheet icon by hand in the Qlik Sense client.
:::

## What it does

The command connects to your Qlik Sense server, finds the apps you name, and clears the sheet icon on every sheet in each of them. The sheets themselves are untouched — only the icon is removed, so each sheet goes back to the default appearance it had before Butler Sheet Icons was ever run.

Before anything is written, the command prints a plan: which server it is talking to, which identity it uses, how many apps matched your selection, and a warning line stating what it is about to do. After the run it prints a summary of what actually happened, per app and per sheet.

::: danger There is no undo
Removing sheet icons is permanent. The images Butler Sheet Icons previously uploaded to a content library are **not** deleted — only the link from each sheet to its icon is cleared — and re-creating the icons means running `qseow create-sheet-thumbnails` again.

Test on a single app before pointing this at a tag that matches many, and use `--dry-run` first.
:::

## See what would happen first: --dry-run

Like the thumbnail-creation commands, `qseow remove-sheet-icons` supports `--dry-run`. It connects, resolves your app selection, lists every sheet and prints exactly what the real run would do — then stops without changing anything:

```
DRY RUN of qseow remove-sheet-icons: planning only - NOTHING WILL BE CHANGED
...
App 1/1: "Sheet thumbnails demo app" (a3e0f5d2-000a-464f-998d-33d333b175d7)
  9 sheets

   #  Sheet                 Would do
   1  Sheet 0 (hidden)      clear icon
   2  Sheet 1               clear icon
   ...

Summary: 1 app(s), 9 sheets. 9 icon(s) would be cleared, 0 skipped.
Nothing was changed. Re-run without --dry-run to apply.
```

Sheets that currently have no icon are marked `(no icon currently set)` — clearing them is a no-op, and the real run reports them the same way rather than failing over them.

This is the recommended first step whenever `--qliksensetag` is involved: the plan shows exactly which apps and sheets matched before anything is touched.

## Basic use

Remove the sheet icons from one app:

::: code-group

```bash [Bash]
butler-sheet-icons qseow remove-sheet-icons \
  --host sense.example.com \
  --certfile ./cert/client.pem \
  --certkeyfile ./cert/client_key.pem \
  --apiuserdir INTERNAL \
  --apiuserid sa_api \
  --appid a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

```powershell [PowerShell]
butler-sheet-icons qseow remove-sheet-icons `
  --host sense.example.com `
  --certfile ./cert/client.pem `
  --certkeyfile ./cert/client_key.pem `
  --apiuserdir INTERNAL `
  --apiuserid sa_api `
  --appid a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

:::

The command is also available as `qseow remove-sheet-thumbnails`. The two names do exactly the same thing.

## Choosing which apps to update

There are two ways to select apps, and **they combine rather than replace each other**:

| Option           | Selects                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| `--appid`        | The apps whose ids you list. Several ids can be given, separated by spaces or commas. |
| `--qliksensetag` | Every app carrying this Qlik Sense tag.                                               |

If you use both, every app named either way is updated — each one exactly once, even if an app is both listed by id and carries the tag.

::: warning Check what a tag matches before you use it
A tag that matches more apps than you expect will clear icons in more apps than you expect. Run with `--dry-run` first — the plan names every matched app — or confirm the tag in the QMC under **Apps**, filtered by tag.
:::

## Fewer options than creating thumbnails

`qseow remove-sheet-icons` deliberately accepts a smaller set of options than `qseow create-sheet-thumbnails`.

Creating a thumbnail means opening each sheet in a browser and photographing it, which is why that command needs web UI login credentials, a browser, a page-wait time and an image directory. Removing an icon just clears a property on the sheet, so **none of that applies here** and none of it is offered:

- No `--logonuserid`, `--logonuserdir` or `--logonpwd` — no browser is opened, so there is nothing to log into
- No `--headless`, `--pagewait`, `--imagedir`, `--includesheetpart` or `--browser`
- No exclude or blur options — the command clears every sheet icon in the apps you select

What it does need is the certificate-based API connection: `--host`, `--certfile`, `--certkeyfile`, `--apiuserdir` and `--apiuserid`, exactly as `create-sheet-thumbnails` does.

## Options

<!-- generated:cli-options qseow remove-sheet-icons -->

| Option                               | Environment Variable                | Description                                                                                                                                                                                                                     | Default                 | Example                    |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------- |
| `--log-level, --loglevel <level>`    | `BSI_QSEOW_RSI_LOG_LEVEL`           | Log level (choices: error, warn, info, verbose, debug, silly)                                                                                                                                                                   | `info`                  | `--loglevel error`         |
| `--host <host>`                      | `BSI_QSEOW_RSI_HOST`                | Qlik Sense server IP/FQDN                                                                                                                                                                                                       | **Required**            | -                          |
| `--engineport <port>`                | `BSI_QSEOW_RSI_ENGINE_PORT`         | Qlik Sense server engine port                                                                                                                                                                                                   | `4747`                  | -                          |
| `--qrsport <port>`                   | `BSI_QSEOW_RSI_QRS_PORT`            | Qlik Sense server repository service (QRS) port                                                                                                                                                                                 | `4242`                  | -                          |
| `--schemaversion <version>`          | `BSI_QSEOW_RSI_SCHEMA_VERSION`      | Qlik Sense engine schema version (choices: 12.170.2, 12.612.0, 12.936.0, 12.1306.0, 12.1477.0, 12.1657.0, 12.1823.0, 12.2015.0)                                                                                                 | `12.612.0`              | `--schemaversion 12.170.2` |
| `--certfile <file>`                  | `BSI_QSEOW_RSI_CERT_FILE`           | Qlik Sense certificate file (exported from QMC)                                                                                                                                                                                 | `./cert/client.pem`     | -                          |
| `--certkeyfile <file>`               | `BSI_QSEOW_RSI_CERTKEY_FILE`        | Qlik Sense certificate key file (exported from QMC)                                                                                                                                                                             | `./cert/client_key.pem` | -                          |
| `--rejectUnauthorized <true\|false>` | `BSI_QSEOW_RSI_REJECT_UNAUTHORIZED` | Ignore warnings when Sense certificate does not match the --host paramater                                                                                                                                                      | `false`                 | -                          |
| `--secure <true\|false>`             | `BSI_QSEOW_RSI_SECURE`              | Connection to Qlik Sense engine is via https                                                                                                                                                                                    | `true`                  | -                          |
| `--apiuserdir <directory>`           | `BSI_QSEOW_RSI_API_USER_DIR`        | User directory for user to connect with when using Sense APIs                                                                                                                                                                   | **Required**            | -                          |
| `--apiuserid <userid>`               | `BSI_QSEOW_RSI_API_USER_ID`         | User ID for user to connect with when using Sense APIs                                                                                                                                                                          | **Required**            | -                          |
| `--appid <id...>`                    | `BSI_QSEOW_RSI_APP_ID`              | Qlik Sense app(s) whose sheet icons should be removed. Several ids can be given, separated by spaces or commas.<br>Combines with --qliksensetag rather than replacing it: apps named either way are all updated, each one once. | -                       | -                          |
| `--qliksensetag <value>`             | `BSI_QSEOW_RSI_QLIKSENSE_TAG`       | Used to control which Sense apps should have their sheet icons removed. All apps with this tag will be updated.                                                                                                                 | `""`                    | -                          |
| `--prefix <prefix>`                  | `BSI_QSEOW_RSI_PREFIX`              | Qlik Sense virtual proxy prefix                                                                                                                                                                                                 | `""`                    | -                          |
| `--dry-run`                          | -                                   | Perform every read and decision the real run would - connect, resolve apps, list sheets - but change nothing. Prints the per-sheet plan and exits.                                                                              | -                       | -                          |
| `-h, --help`                         | -                                   | display help for command                                                                                                                                                                                                        | -                       | `-h`                       |

<!-- /generated:cli-options -->

## What you will see

A real run opens with a plan block naming the server, the API identity and the matched apps, followed by the line that states the stakes:

```
WILL REMOVE sheet icons from 1 app(s)
```

Each sheet is then reported as `cleared` (or `no icon` when there was nothing to clear), the app is saved once, and the run closes with a result summary. If the terminal supports it, the same information renders as a compact run card instead of plain lines — the content is identical.

If nothing matched your selection, the command says so and exits with code 1 rather than reporting a clean run. The same applies when an app fails partway through, so a scheduled task will notice the failure.

## Troubleshooting

**"Missing certificate file(s). Aborting"**
The paths given in `--certfile` and `--certkeyfile` do not point at readable files. Relative paths are resolved from the folder holding the Butler Sheet Icons executable, not from your current directory.

**"No apps to process. Check the --appid and --qliksensetag options."**
Neither the app ids you gave nor the tag matched anything the API user can see. Check the tag spelling first — a misspelled tag matches no apps. Also confirm the account named by `--apiuserdir` and `--apiuserid` can actually see the app: the app list is scoped to what that account may read, so an app you can see in the hub may still be invisible here.

The command exits with code 1 in this case, so a scheduled task will report it as a failure rather than as a clean run.

**The command cannot reach the server**
`--host` must be reachable on the QRS port (`4242` by default) and the engine port (`4747` by default) from the machine running Butler Sheet Icons. These are not the ports the Qlik Sense web client uses.

## Related

- `qseow create-sheet-thumbnails` — creates the sheet icons this command removes
- `qscloud remove-sheet-icons` — the Qlik Sense Cloud equivalent. One difference worth knowing: the Cloud command also deletes the thumbnail image files from each app's media library, while the QSEoW command leaves the content library files in place (they are overwritten by the next thumbnail run).
- `--dry-run` — the concept page on dry runs applies to this command unchanged
