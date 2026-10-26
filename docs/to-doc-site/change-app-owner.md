# Taking over app ownership while thumbnails are created

A common situation: an app belongs to Anna, and Joe is asked to update its sheet thumbnails.
Butler Sheet Icons fails for Joe, because he cannot work with an app someone else owns. Joe is a
Qlik Sense administrator, so the workaround is easy enough: in the QMC, make himself the app's
owner, run Butler Sheet Icons, then give the app back to Anna.

Butler Sheet Icons can now do that itself, app by app, with the new `--change-app-owner` option.
It gives each app to the account the browser signs in as, creates the thumbnails, and gives the app
back to its original owner - also when creating the thumbnails fails.

::: warning Requires BSI 5.4.0 or later
Earlier versions do not have `--change-app-owner` or `--change-app-owner-wait`, and stop with
`error: unknown option '--change-app-owner'`.
:::

## How to use it

Add `--change-app-owner` to `create-sheet-thumbnails`, on either platform:

::: code-group

```powershell [QSEoW (PowerShell)]
.\butler-sheet-icons.exe qseow create-sheet-thumbnails `
  --host sense.example.com `
  --apiuserdir INTERNAL `
  --apiuserid sa_api `
  --logonuserdir ACME `
  --logonuserid joe `
  --logonpwd $env:BSI_PWD `
  --qliksensetag "update thumbnails" `
  --change-app-owner
```

```bash [Qlik Cloud (Bash)]
./butler-sheet-icons qscloud create-sheet-thumbnails \
  --tenanturl your-tenant.eu.qlikcloud.com \
  --apikey "$BSI_APIKEY" \
  --logonuserid joe@example.com \
  --logonpwd "$BSI_PWD" \
  --collectionid 6d2e1f0c-... \
  --change-app-owner
```

:::

Or, in a `.env` file or a scheduled job's environment:

```
BSI_QSEOW_CST_CHANGE_APP_OWNER=true
BSI_QSCLOUD_CST_CHANGE_APP_OWNER=true
```

`--change-app-owner-wait <seconds>` sets how long Butler Sheet Icons waits after changing an app's
owner before it starts on the app, so the change has reached every part of Qlik Sense. The
default is 3 seconds; anything from 0 to 300 is accepted. As environment variables:
`BSI_QSEOW_CST_CHANGE_APP_OWNER_WAIT` and `BSI_QSCLOUD_CST_CHANGE_APP_OWNER_WAIT`.

The option is only on `create-sheet-thumbnails`. `remove-sheet-icons` does not have it.

## Which account becomes the owner

The temporary owner is **the account the browser signs in as** - the one whose view of each sheet
becomes the thumbnail.

| Platform and login                                                 | Temporary owner                                                                                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| QSEoW, signing in with a login page                                | The user given by `--logonuserdir` and `--logonuserid`                                                                        |
| QSEoW with [`--skip-login`](/guide/configuration/qseow#skip-login) | The account the virtual proxy signs the browser in as. Butler Sheet Icons signs in once, at the start of the run, to find out |
| Qlik Cloud, with or without `--skip-login`                         | The user the browser signs in as. Butler Sheet Icons signs in once, at the start of the run, to find out                      |

That extra browser session is closed again before the first app is touched. If it cannot sign
in, the run stops there, having changed nothing.

The owner change itself, and every write to the apps, is still made by the account Butler Sheet
Icons uses for the APIs: the API user (`--apiuserdir`, `--apiuserid`) on QSEoW, and the owner of
the API key on Qlik Cloud. That account must therefore be allowed to change app owners:

- **QSEoW:** the API user needs the right to change the owner of apps - as a RootAdmin has, for
  example. The temporary owner must also exist in Qlik Sense: it is listed under **Users** in the
  QMC once it has signed in at least once, or has been synchronised from its user directory. If it
  is not there, the run stops before touching any app and says so.
- **Qlik Cloud:** the owner of the API key needs permission to change the apps' owner. A tenant
  admin can do this in every space; an analytics admin in shared and managed spaces.

On Qlik Cloud, if the browser signs in as a different user than the one the API key belongs to,
Butler Sheet Icons says so at the start of the run, since that other user still makes every write.

## What happens to each app

For each app, in this order:

1. Butler Sheet Icons reads who owns the app right now.
2. It **writes the original owner to the log**, together with how to put it back by hand,
   **before** it changes anything.
3. It makes the temporary owner the app's owner, and waits `--change-app-owner-wait` seconds.
4. It creates and uploads the thumbnails, exactly as without the option.
5. It gives the app back to its original owner - whether step 4 worked or not.

In the log:

```
info: QSEOW APP OWNER: Changing the owner of app 2d3f... "Sales" from ACME\anna to ACME\joe while it is processed. If this run stops before changing it back: In the QMC, open Apps, edit app 2d3f... and set its owner back to ACME\anna.
info: QSEOW APP OWNER: App 2d3f... "Sales" is owned by ACME\anna again.
```

The run's summary at the end counts what happened to the owners:

```
RESULT  ok
  apps          3 ok, 0 failed
  ...
  app owner     2 changed and restored, 1 kept
```

### Apps whose owner is left alone

The owner is not changed, and the app is processed exactly as it would be without the option,
when:

- **the temporary owner already owns the app**;
- on Qlik Cloud, **the app is published**. Qlik Cloud changes a published app's owner through its
  source app, and only then republishes it;
- on Qlik Cloud, **the app is in a personal space**, which belongs to its owner.

On QSEoW, published apps are given a temporary owner like any other app.

## When something goes wrong

Butler Sheet Icons is built so that an app is never knowingly left with the wrong owner.

| What happens                                                | What Butler Sheet Icons does                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| It cannot read or change the owner of an app                | That app fails and is left exactly as it was. The run carries on with the next app.                                           |
| Creating the thumbnails fails                               | The app is given back to its original owner first, then reported as failed.                                                   |
| You press Ctrl-C, or the job is stopped with `docker stop`  | The app being processed is given back to its original owner before Butler Sheet Icons exits.                                  |
| Someone changes the app's owner while it is being processed | That change is kept, and a warning names the original owner. Butler Sheet Icons does not undo someone else's change.          |
| The original owner cannot be restored                       | Tried three times. If it still fails, **the run stops**: no further app has its owner changed, and the exit code is non-zero. |

When the original owner cannot be restored, the log says which app, who owned it, and how to fix
it:

```
error: QSEOW APP OWNER: App 2d3f... "Sales" may still be owned by ACME\joe: BSI could not give it back to ACME\anna after 3 attempts. Received error code: 500::Internal Server Error
error: QSEOW APP OWNER: To give it back by hand: In the QMC, open Apps, edit app 2d3f... and set its owner back to ACME\anna.
error: Stopping the run: BSI could not give an app back to its original owner, so it changes no further owners. 2 of 4 app(s) were not started.
```

and the summary lists every app that may still have the temporary owner:

```
RESULT  FAILED
  apps          1 ok, 1 failed, 2 not started
  stopped       an app owner could not be restored, so no further app was started
  ...
  app owner     1 changed and restored, 1 NOT RESTORED
  NOT RESTORED  app 2d3f... "Sales" may still be owned by ACME\joe - its owner was ACME\anna
```

### If Butler Sheet Icons is killed

Nothing can restore an owner after the process is gone: a second Ctrl-C ("exit immediately"), the
shutdown time limit running out, `kill -9`, a crash, or the machine losing power. That is why the
original owner is written to the log **before** each change. If a run ended abruptly:

1. Look for `Changing the owner of app` lines in the log. Each one names the app and its original
   owner.
2. For a second Ctrl-C or the shutdown time limit, the summary is still printed and lists the
   app under `NOT RESTORED`.
3. Give each such app back to its owner by hand: in the QMC, under **Apps**, edit the app and set
   **Owner**; on Qlik Cloud, in the Administration activity center, under **Content**, change the
   app's owner.

Keep the logs of scheduled runs that use `--change-app-owner`. They are the record of who owned
what.

## Seeing it in a dry run

With [`--dry-run`](/guide/concepts/dry-run), nothing is changed, and the report shows each app's
current owner and what a real run would do with it:

```
App 1/3: "Sales" (2d3f...)
  ...
  Owner: ACME\anna would be changed to ACME\joe while the app is processed, then restored
```

A dry run does not open a browser, so with `--skip-login`, and always on Qlik Cloud, it cannot
know who the browser will sign in as. It then says `the browser login user` instead of naming
someone.

## In interactive mode

The wizard asks about it among the advanced options:

```
Make the browser login user the owner of each app while the app is processed, then give the app back to its original owner.
```

(On Qlik Cloud: _Make the account the browser signs in as the owner of each app..._) Only if you
answer yes does it ask how long to wait:

```
Seconds to wait after changing an app's owner before processing the app, so the change has reached every Qlik Sense service.
```

---

## For the publisher

- **Version gate.** Written as 5.4.0: the change is a `feat`, and the open release PR was at
  5.3.2 when this was drafted. Take the version from the release PR's title at publish time.
- **Check the QSEoW rights wording.** The page says the API user needs the right to change app
  owners "as a RootAdmin has". Confirm which of the usual API users (`INTERNAL\sa_api`, a
  RootAdmin service account) can do it on a default installation, and name them if that helps.
- **Not yet verified against a live server.** Göran is to run an insiders build on QSEoW (form
  login and `--skip-login`; an unpublished and a published app owned by someone else) and on Qlik
  Cloud (a shared-space app owned by someone else; a published and a personal-space app, which must
  keep their owners), including one run stopped with Ctrl-C. Check the owners before and after in
  the QMC and the Cloud console. Two things only a live run can show, to settle before publishing:
    - on QSEoW, whether owning the app is enough when its sheets still belong to the previous owner;
    - on Qlik Cloud, whether making a user an app's owner also adds that user to the space - a
      side effect that giving the app back would not undo. If it does, say so on this page.
- **Pages to update:** regenerate the option tables on `/reference/qseow` and `/reference/qscloud`
  (`npm run docs:cli-tables -- --command "qseow create-sheet-thumbnails"`, and the same for
  `qscloud`). Add a short paragraph with a link to this page to `/guide/configuration/qseow` and
  `/guide/configuration/qlik-sense-cloud`, and a troubleshooting entry for
  `may still be owned by` / `NOT RESTORED` pointing at the "If Butler Sheet Icons is killed"
  section.
- **Suggested placement:** a new concept page, `/guide/concepts/app-owner-change`, next to
  `dry-run` and `interrupting-a-run`.
- **Related bug, not part of this feature:** after a second Ctrl-C the summary can count the app
  that was being processed as `ok` (#1211), right beside its `NOT RESTORED` line. Do not document
  that as intended.
