# Taking over app ownership while thumbnails are created

A common situation: an app belongs to Anna, and Joe is asked to update its sheet thumbnails.
Butler Sheet Icons fails for Joe, because he cannot work with an app someone else owns. Joe is a
Qlik Sense administrator, so the workaround is easy enough: in the QMC, make himself the app's
owner, run Butler Sheet Icons, then give the app back to Anna.

Butler Sheet Icons can now do that itself, app by app, with the new `--change-app-owner` option.
It gives each app to the account the browser signs in as, creates the thumbnails, and gives the app
back to its original owner - also when creating the thumbnails fails.

::: danger Changing an app's owner is not a small change
On Qlik Sense Enterprise on Windows (QSEoW), changing who owns an app also changes who owns most of
what is **in** it: sheets, stories, bookmarks, master items, the load script. Butler Sheet Icons
does this twice for every app - to the browser login user, and back - and then puts back what Qlik
Sense moved that should not have moved. Done by hand in the QMC, the same steps would quietly hand
the login user's own sheets in that app to the app's owner.

Read [What else changes when an app's owner changes](#side-effects) and
[Before you use it on real apps](#before-you-use-it) before turning this option on for apps people
work in.
:::

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
the API key on Qlik Cloud. That account must therefore be allowed to change owners:

- **QSEoW:** the API user needs the right to change the owner of apps **and of app objects** -
  as a RootAdmin has, for example. The temporary owner must also exist in Qlik Sense: it is listed
  under **Users** in the QMC once it has signed in at least once, or has been synchronised from its
  user directory. If it is not there, the run stops before touching any app and says so.
- **Qlik Cloud:** the owner of the API key needs permission to change the apps' owner. A tenant
  admin can do this in every space; an analytics admin in shared and managed spaces.

On Qlik Cloud, if the browser signs in as a different user than the one the API key belongs to,
Butler Sheet Icons says so at the start of the run, since that other user still makes every write.

## What else changes when an app's owner changes {#side-effects}

### On QSEoW, the app's objects move with it

When an app gets a new owner on QSEoW - in the QMC, through the API, or from Butler Sheet Icons -
Qlik Sense also gives the new owner **every object in the app that the previous owner had**:
sheets, stories, bookmarks, master dimensions and measures, the load script, the data model.
Objects that belong to anyone else are not touched.

Butler Sheet Icons changes each app's owner twice, so this happens twice. With Joe as the browser
login user, processing Anna's app looks like this:

| Objects in Anna's app                              | Before the run | While the app is processed | After the run                                |
| -------------------------------------------------- | -------------- | -------------------------- | -------------------------------------------- |
| Anna's sheets, bookmarks, master items, load script | Anna           | **Joe**                    | Anna                                         |
| Joe's own sheets and bookmarks in Anna's app       | Joe            | Joe                        | Joe - **given back** by Butler Sheet Icons   |
| Everyone else's sheets and bookmarks               | them           | them                       | them                                         |

The middle row is the one to understand. Changing the owner back from Joe to Anna hands Anna
**everything Joe owns in the app at that moment** - including what Joe had there before the run,
such as his own community sheets in a published app. Qlik Sense does not remember which objects
were whose.

That is why, before it changes an app's owner, Butler Sheet Icons lists the objects the login user
already owns in that app and writes them to the log. Once the app is back with its owner, it gives
exactly those objects back to the login user, one at a time:

```
info: QSEOW APP OWNER: ACME\joe already owns 2 object(s) in app 2d3f... "Sales": sheet "Joe's notes" (5f2a...), bookmark "Q3 review" (7b1d...). Changing the app's owner moves them too, so BSI gives them back to ACME\joe after it restores the app's owner.
info: QSEOW APP OWNER: Changing the owner of app 2d3f... "Sales" from ACME\anna to ACME\joe while it is processed. If this run stops before changing it back: In the QMC, open Apps, edit app 2d3f... and set its owner back to ACME\anna. That also moves the 2 object(s) ACME\joe already owned in the app to ACME\anna. In the QMC, open App objects and set the owner of each of these back to ACME\joe: sheet "Joe's notes" (5f2a...), bookmark "Q3 review" (7b1d...).
...
info: QSEOW APP OWNER: App 2d3f... "Sales" is owned by ACME\anna again.
info: QSEOW APP OWNER: Gave 2 object(s) in app 2d3f... "Sales" back to ACME\joe: sheet "Joe's notes", bookmark "Q3 review".
```

When the login user owns nothing in an app, there is nothing to give back, and the first and last
of these lines do not appear.

An object from that list that is deleted, or given to someone else, while the app is being
processed is left as it is: taking it back would undo someone's change. A warning names it.

### The owner does not own the app while it is processed

For as long as Butler Sheet Icons works on an app - usually well under a minute - its owner does
not own it, or the objects in it that moved. Someone editing their app or their sheets at that
moment can find they no longer may.

### What moves shows as modified

Each owner change marks the app, and every object it moves, as last modified by the API user at
that moment. The objects themselves do not change, but the QMC's **Last modified** columns will
show the run rather than the last real edit.

### On Qlik Cloud

On Qlik Cloud, Butler Sheet Icons changes only the app's owner. It does not list or give back any
objects.

## Before you use it on real apps {#before-you-use-it}

- **Try it first** on a test app, or on a copy of a real one, and check the owners of the app and
  its sheets before and after in the QMC (**Apps** and **App objects**).
- **Run it with [`--dry-run`](/guide/concepts/dry-run) first.** Nothing is changed, and the report
  shows each app's owner, whether it would be changed, and which of the login user's objects would
  be moved and given back.
- **Prefer a browser login account that owns nothing in other people's apps**, such as a service
  account used only by Butler Sheet Icons. Then there is nothing of its own to move and give back,
  and the run touches only what the app's owner had.
- **Run it when people are not working in their apps**, for example at night.
- **Keep the logs** of every run that uses `--change-app-owner`. They are the record of who owned
  what, should a run be stopped before it could put everything back.

## What happens to each app

For each app, in this order:

1. Butler Sheet Icons reads who owns the app right now.
2. On QSEoW, it lists the objects the login user already owns in the app.
3. It **writes the original owner, and those objects, to the log**, together with how to put both
   back by hand, **before** it changes anything.
4. It makes the login user the app's owner, and waits `--change-app-owner-wait` seconds.
5. It creates and uploads the thumbnails, exactly as without the option.
6. It gives the app back to its original owner - whether step 5 worked or not - and then gives the
   login user back the objects from step 2.

The run's summary at the end counts what happened to the owners:

```
RESULT  ok
  apps          3 ok, 0 failed
  ...
  app owner     2 changed and restored, 2 object(s) given back to ACME\joe, 1 kept
```

### Apps whose owner is left alone

The owner is not changed, and the app is processed exactly as it would be without the option,
when:

- **the login user already owns the app**;
- on Qlik Cloud, **the app is published**. Qlik Cloud changes a published app's owner through its
  source app, and only then republishes it;
- on Qlik Cloud, **the app is in a personal space**, which belongs to its owner.

On QSEoW, published apps are given a temporary owner like any other app.

## When something goes wrong

Butler Sheet Icons is built so that an app, or an object in it, is never knowingly left with the
wrong owner.

| What happens                                                         | What Butler Sheet Icons does                                                                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| It cannot read who owns an app, or change it                         | That app fails and is left exactly as it was. The run carries on with the next app.                                               |
| On QSEoW, it cannot list the login user's objects in an app          | That app fails and is left exactly as it was. The run carries on with the next app.                                               |
| Creating the thumbnails fails                                        | The app is given back to its original owner, and the login user's objects to the login user, first. Then the app is reported as failed. |
| You press Ctrl-C, or the job is stopped with `docker stop`           | The app being processed, and the login user's objects in it, are given back before Butler Sheet Icons exits.                        |
| Someone changes the app's owner while it is being processed          | That change is kept, and a warning names the original owner. Butler Sheet Icons does not undo someone else's change.             |
| The original owner cannot be restored                                | Tried three times. If it still fails, **the run stops**: no further app has its owner changed, and the exit code is non-zero.    |
| The login user's objects cannot be given back                        | Tried three times. If it still fails, **the run stops** the same way.                                                             |

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

When the login user owned objects in that app, the `NOT RESTORED` line says so too, and the fix in
the log covers them: giving the app back by hand moves them to the app's owner, just as it does
for Butler Sheet Icons.

When the login user's objects cannot be given back, the app itself is already back with its owner,
and the summary lists the objects instead:

```
RESULT  FAILED
  apps          0 ok, 1 failed, 2 not started
  stopped       objects in an app could not be given back to their owner, so no further app was started
  ...
  app owner     1 changed and restored, 2 object(s) NOT RETURNED
  NOT RETURNED  app 2d3f... "Sales": 2 object(s) ACME\joe owned before the run may now be owned by the app's owner - sheet "Joe's notes", bookmark "Q3 review"
```

The log, as always, has the full list with each object's id, and how to give them back in the QMC.

### If Butler Sheet Icons is killed

Nothing can restore an owner after the process is gone: a second Ctrl-C ("exit immediately"), the
shutdown time limit running out, `kill -9`, a crash, or the machine losing power. That is why the
original owner, and the login user's objects, are written to the log **before** each change. If a
run ended abruptly:

1. Look for `Changing the owner of app` lines in the log. Each one names the app and its original
   owner - and, when the login user owned objects in the app, lists them with their ids.
2. For a second Ctrl-C or the shutdown time limit, the summary is still printed and lists the app
   under `NOT RESTORED`, or under `NOT RETURNED` if it was stopped while giving objects back.
3. Give each such app back to its owner by hand: in the QMC, under **Apps**, edit the app and set
   **Owner**; on Qlik Cloud, in the Administration activity center, under **Content**, change the
   app's owner.
4. On QSEoW, giving an app back moves the login user's own objects in it to the app's owner as
   well. So then give back the objects the log listed for that app: in the QMC, under
   **App objects**, edit each one and set **Owner** to the login user.

## Seeing it in a dry run

With [`--dry-run`](/guide/concepts/dry-run), nothing is changed, and the report shows each app's
current owner and what a real run would do with it:

```
App 1/3: "Sales" (2d3f...)
  ...
  Owner: ACME\anna would be changed to ACME\joe while the app is processed, then restored. ACME\joe already owns 2 object(s) in the app, which the change back would move to ACME\anna; they would be given back to ACME\joe after: sheet "Joe's notes", bookmark "Q3 review"
```

A dry run does not open a browser, so with `--skip-login`, and always on Qlik Cloud, it cannot
know who the browser will sign in as. It then says `the browser login user` instead of naming
someone, and cannot list that user's objects.

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
- **Keep the danger box and the side-effects section prominent.** Göran asked for this option to
  be documented as a slightly risky operation. Link the side-effects section from the
  configuration pages and from the option's reference entry, not just this page.
- **Check the QSEoW rights wording.** The page says the API user needs the right to change the
  owner of apps and app objects "as a RootAdmin has". Confirm which of the usual API users
  (`INTERNAL\sa_api`, a RootAdmin service account) can do both on a default installation, and name
  them if that helps. Also confirm the QMC wording for step 4 of "If Butler Sheet Icons is killed":
  **App objects**, edit, **Owner**.
- **Verified against a live server so far** (Qlik Sense 31.62, May 2026, 2026-10-26): a run whose
  sign-in failed (owner changed and restored, exit code 1); a successful run (three sheets
  captured as the temporary owner, owner restored, exit code 0); and, with the QRS calls Butler
  Sheet Icons makes, that an app owner change moves every object of the previous owner - sheets,
  load script, data model, master items - and leaves other users' objects alone. The "What moves
  shows as modified" section is from the same runs, in which every object in the app moved; whether
  an object that does not move is stamped too was not checked.
- **Still to verify before publishing:** on QSEoW, a run in which the login user owns objects in
  the app (they must end with the login user), `--skip-login`, a published app, and one run stopped
  with Ctrl-C; on Qlik Cloud, a shared-space app owned by someone else, and a published and a
  personal-space app, which must keep their owners. Two Cloud questions only a live run can answer:
    - whether making a user an app's owner also adds that user to the space - a side effect that
      giving the app back would not undo. If it does, say so on this page;
    - whether a Cloud owner change moves the previous owner's objects (private sheets, bookmarks)
      to the new owner, as QSEoW does. If it does, the "On Qlik Cloud" section is wrong as it
      stands, and Butler Sheet Icons needs the same give-back on Cloud: open an issue before
      publishing.
- **Pages to update:** regenerate the option tables on `/reference/qseow` and `/reference/qscloud`
  (`npm run docs:cli-tables -- --command "qseow create-sheet-thumbnails"`, and the same for
  `qscloud`). Add a short paragraph with a link to this page to `/guide/configuration/qseow` and
  `/guide/configuration/qlik-sense-cloud`, and troubleshooting entries for `may still be owned by` /
  `NOT RESTORED` and `NOT RETURNED`, pointing at the "If Butler Sheet Icons is killed" section.
- **Suggested placement:** a new concept page, `/guide/concepts/app-owner-change`, next to
  `dry-run` and `interrupting-a-run`. The `{#side-effects}` and `{#before-you-use-it}` anchors
  are used by the danger box at the top; keep them if the headings are reworded.
- **Related bug, not part of this feature:** after a second Ctrl-C the summary can count the app
  that was being processed as `ok` (#1211), right beside its `NOT RESTORED` line. Do not document
  that as intended.
