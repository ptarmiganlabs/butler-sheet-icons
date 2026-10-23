<!--
PUBLISHED 2026-10-23 to the doc site via ptarmiganlabs/butler-sheet-icons-docs#123 (into `next`,
then to production with the 5.3.0 release merge). Shipped in BSI 5.3.0.

Where it went:
- guide/configuration/qseow.md - new section "Windows Authentication: `--skip-login`" (#skip-login).
- guide/troubleshooting.md - ERR_INVALID_AUTH_CREDENTIALS section gains --skip-login as the second
  fix, its "cannot use Windows authentication at all" text is gated to <= 5.2.x, and a new section
  "`--skip-login` stops the run (QSEoW)" (#qseow-skip-login-errors) carries the messages.
- guide/configuration/qlik-sense-cloud.md - SSO section: the Cloud changes and the upgrade note.
- guide/quick-start.md, guide/concepts/environment-variables.md, reference/qseow.md and
  reference/qscloud.md (regenerated option tables).

No claims in this draft turned out to be wrong. The version gate (5.3.0) was confirmed against the
release-please PR before publishing.
-->

# Creating thumbnails through a Windows authentication virtual proxy

Some Qlik Sense environments never show a login page. Open the hub, the QMC or an app in a
browser on a domain-joined Windows machine, such as a Sense node you reached over Remote Desktop,
and you go straight in. Qlik Sense has signed you in with **Windows authentication**, as the
Windows account you are logged in with.

Butler Sheet Icons used to expect a login page every time, so it could not work through such a
virtual proxy. It can now, with the new `--skip-login` option.

::: warning Requires BSI 5.3.0 or later
Earlier versions always expect a login page. On a Windows authentication virtual proxy they stop
with `No element found for selector: #username-input`, or with `ERR_INVALID_AUTH_CREDENTIALS`.
:::

## How to use it

Add `--skip-login`, and leave out `--logonuserdir`, `--logonuserid` and `--logonpwd`:

```powershell
.\butler-sheet-icons.exe qseow create-sheet-thumbnails `
  --host sense.example.com `
  --apiuserdir INTERNAL `
  --apiuserid sa_api `
  --skip-login `
  --appid ded8d27d-...
```

Or, in a `.env` file or a scheduled job's environment:

```
BSI_QSEOW_CST_SKIP_LOGIN=true
```

Everything else works as before. The certificates given with `--certfile` and `--certkeyfile`,
and the API user given with `--apiuserdir` and `--apiuserid`, are still used to talk to Qlik
Sense's services. `--skip-login` only changes how the **browser** signs in.

## Which account the thumbnails are rendered as

With `--skip-login`, Butler Sheet Icons types nothing into a login page. Qlik Sense signs the
browser in as **the Windows account that runs Butler Sheet Icons**:

| How Butler Sheet Icons is started | Account the browser signs in as                       |
| --------------------------------- | ----------------------------------------------------- |
| From a command prompt you opened  | Your own Windows account                              |
| From a Windows scheduled task     | The account the task is set to run as, not its author |
| From a Windows service            | The service's account                                 |

This matters more than it may seem. A thumbnail is a picture of the sheet as that user sees it.
If an app uses **section access**, or if the account cannot open an app at all, that changes what
the thumbnails show. Choose the account deliberately, the same way you would choose the user
for `--logonuserid`.

The log names the account Qlik Sense actually signed in, once per app:

```
info: Login skipped (--skip-login): the virtual proxy signed the browser in as ACME\svc-bsi
```

If Qlik Sense does not say, the line ends after `signed the browser in`, and the run carries on.

## What the virtual proxy needs

`--skip-login` relies on the virtual proxy signing the browser in by itself. Use it when all of
these are true:

- Butler Sheet Icons runs **on Windows**.
- The virtual proxy it connects to (the default one, or the one named with `--prefix`) uses
  Windows authentication for browsers on Windows. Its **Windows authentication pattern** must
  match the browser. The default pattern, `Windows`, does.
- The Windows account running Butler Sheet Icons is one Qlik Sense accepts, and it can open the
  apps you are updating.

A quick check is to sign in to that machine as that account, open the app's address in a browser,
and see whether you get the app or a login page.

You do not need to change any browser setting. Normally a browser offers your Windows account
only to servers it considers part of the local intranet, and a server name containing a dot,
such as `sense.example.com`, is not one of them by default. With `--skip-login`, Butler Sheet
Icons tells its own browser that the server named by `--host` may be offered the account, and no
other server. Two things follow from that:

- **Give `--host` as the name the virtual proxy uses**, normally the one on the server's
  certificate. If the proxy moves the browser on to a different name, the browser has no
  permission to offer the account there. `--host` must be a single host name or IP address; a
  value containing a comma or `*` is refused, because either would widen the permission to other
  servers.
- **Other servers a sheet loads content from are not offered the account.** If a sheet shows an
  image or extension content from another intranet server that itself uses Windows
  authentication, that content appears in the thumbnail the way an anonymous visitor would see it.
  This is deliberate: the alternative is offering the account to every server a sheet happens to
  reference.

## Credentials are refused alongside `--skip-login`

With `--skip-login`, a logon user and password would never be used. If one is supplied anyway, it
usually means a different identity was expected than the one the browser will actually sign in
as, so the run stops before connecting to anything:

```
error: QSEOW CREATE THUMBNAILS 2: QSEOW: --skip-login is set, so nothing is typed into a login page, but --logonpwd (BSI_QSEOW_CST_LOGON_PWD) is set as well. Remove it - from the environment as well as the command line - or drop --skip-login.
```

The message names the environment variable as well as the option. A shared `.env` file that still
holds `BSI_QSEOW_CST_LOGON_PWD` is the most likely place for a leftover password.

Without `--skip-login`, the three options are still required, as before. Leaving one out now
gives this message:

```
error: QSEOW CREATE THUMBNAILS 2: QSEOW: missing --logonpwd (BSI_QSEOW_CST_LOGON_PWD). These are typed into the Qlik Sense login page. Supply them, or use --skip-login if the browser is signed in without a login page.
```

## Messages you may see

**The virtual proxy showed its login page anyway.** With `--skip-login`, the run stops at the
first app instead of taking pictures of a login form:

```
QSEOW APP: not authenticated after opening the app with --skip-login. The login form's username field (#username-input) is still on the page, so the browser is on the login screen. Continuing would capture that screen as though it were a sheet. The virtual proxy served its login form instead of signing the browser in. Its Windows authentication pattern does not match this browser's User-Agent, or it is not set up for Windows authentication. Use --prefix with a virtual proxy that signs Windows users in, or drop --skip-login and supply credentials.
```

This is expected if Butler Sheet Icons runs on macOS or Linux, or if `--prefix` names a virtual
proxy whose Windows authentication pattern is `Form`.

**Qlik Sense refused the Windows account.** With `--skip-login`, the refusal can arrive in two
ways, and both name the account:

```
QSEOW APP: the browser could not sign in at https://sense.example.com/sense/app/ded8d27d-... (ERR_INVALID_AUTH_CREDENTIALS). With --skip-login the virtual proxy signs the browser in with Windows authentication, as the Windows account running Butler Sheet Icons (ACME\svc-bsi), and it was refused. Check that this account can open the app in Qlik Sense, and that it is the account you expect.
```

```
QSEOW APP: not signed in with --skip-login: opening https://sense.example.com/sense/app/ded8d27d-... ended on HTTP 401 Unauthorized at https://sense.example.com/internal_windows_authentication/?targetId=... - not the app, and not a login page. With --skip-login the virtual proxy signs the browser in with Windows authentication, as the Windows account running Butler Sheet Icons (ACME\svc-bsi), and it was not accepted. Check that this account can open the app in Qlik Sense, and that it is the account you expect.
```

Any other HTTP error the app address ends on stops the run the same way, with the status and the
address the browser ended up at. Butler Sheet Icons does not treat an error page as "signed in"
just because it has no login form.

**No login page, and no `--skip-login`.** The run used to stop with
`No element found for selector: #username-input`, which said nothing useful. It now says which page
the browser was on instead, so you can tell what it was:

```
QSEOW APP: no login form on the page - the username field (#username-input) is not on https://sense.example.com/sense/app/ded8d27d-... (title "Sales dashboard"), so there is nothing to type the credentials into. If that page is the app itself, the browser is already signed in - a virtual proxy using Windows authentication does that - and --skip-login, without --logonuserdir, --logonuserid and --logonpwd, is how to run against it.
```

If the title is your app's name, this is the situation `--skip-login` exists for. If the page was
an HTTP error instead, the message gives the status in place of that advice. A 400 is the common
one: Qlik Sense answers 400 when the host name in `--host` is not in the virtual proxy's host
allow list:

```
QSEOW APP: no login form on the page - the username field (#username-input) is not on https://sense.example.com/sense/app/ded8d27d-... (no title), so there is nothing to type the credentials into. Opening https://sense.example.com/sense/app/ded8d27d-... ended on HTTP 400 Bad Request - not the app, and not a login page. One known cause: Qlik Sense answers 400 when the host name in the address ("sense.example.com", from --host) is not in the virtual proxy's host allow list. Compare --host with that list in the QMC, or with the name on the server's certificate.
```

**`ERR_INVALID_AUTH_CREDENTIALS` without `--skip-login`.** This error is already covered in the
troubleshooting guide. The message now explains itself, and offers `--skip-login` as a second way
out next to the dedicated form-login virtual proxy:

```
QSEOW APP: the browser could not sign in at https://sense.example.com/sense/app/ded8d27d-... (ERR_INVALID_AUTH_CREDENTIALS). The virtual proxy asked for Windows authentication instead of serving its login form. Qlik Sense decides this from the browser's User-Agent, and a browser on Windows matches the default pattern. Use --prefix with a virtual proxy whose Windows authentication pattern does not match (the convention is 'Form'), or, if the Windows account running Butler Sheet Icons can open the app in Qlik Sense, use --skip-login.
```

## In interactive mode

The wizard (`butler-sheet-icons qseow create-sheet-thumbnails --interactive`) now asks, after the
API user:

```
Does the virtual proxy sign the browser in by itself, with no login page?
```

Answer yes and it does not ask for a logon user directory, user or password.

If a logon user or password is already set - on the command line, or left in `.env` from earlier
runs that used the login page - the wizard does not accept the yes. It says which ones are set,
right at that question, rather than letting the run stop on them after everything else has been
answered:

```
--logonpwd (BSI_QSEOW_CST_LOGON_PWD) is already set, on the command line or in the environment, and the run refuses logon credentials alongside --skip-login. Answer no, or remove it and start again.
```

## Changes to `--skip-login` on Qlik Sense Cloud

`qscloud create-sheet-thumbnails` has had a `--skip-login` option for a long time, for a browser
that is already signed in. Two things about it change in the same release.

**Setting the environment variable to `false` now turns it off.** Until now, setting
`BSI_QSCLOUD_CST_SKIP_LOGIN` to _anything_, including `false`, turned skip-login on. Its value is
now read: `true`, `1`, `yes` or `on` turn it on, and `false`, `0`, `no`, `off` or an empty
value turn it off. Any other value stops the run with a message listing the accepted values. The
same applies to the new `BSI_QSEOW_CST_SKIP_LOGIN`, and to `--skip-login false` on the command
line.

If a job has `BSI_QSCLOUD_CST_SKIP_LOGIN=false` and still works, it has been skipping login
without anyone meaning it to. After upgrading, it signs in with the credentials it is given.

**`--logonuserid` and `--logonpwd` are no longer needed with `--skip-login`.** They used to be
required even though they were never used. If they are given anyway, the run carries on and
says so:

```
warn: CLOUD: --skip-login is set, so nothing is typed into a login page, but --logonuserid (BSI_QSCLOUD_CST_LOGON_USER_ID), --logonpwd (BSI_QSCLOUD_CST_LOGON_PWD) are set as well. They are ignored. A future major release will refuse this combination.
```

Remove them from the job now to avoid that later. Without `--skip-login`, both are still
required.

---

<!-- Notes for the publishing pass — not for the site -->

## For the publisher

**Version gate.** 5.3.0 is an assumption: the change ships as `feat` commits on top of 5.2.1, and
release-please turns that into a minor release. Check the release that actually contains it
before publishing, and correct the warning box and every mention of 5.3.0.

**Verified against a live Windows authentication proxy** on 2026-10-23: the insiders build of
commit `62c9d4f` was run on a QSEoW test server, and Göran reported that it worked as it should
there. The flag, the startup checks and the Cloud environment-variable fix were also checked
against the implementation. The startup messages were captured from real runs of the CLI. The
browser-stage messages (the HTTP-status ones, the no-login-form ones and the wizard's) were
generated by calling the implementation, with the account name replaced by `ACME\svc-bsi`.

**Pages to update besides placing this one:**

- `guide/troubleshooting.md`, the `ERR_INVALID_AUTH_CREDENTIALS` section (from
  `done_windows-run-fails-with-invalid-auth-credentials.md`). Its closing section, _What this
  means in general_, says Butler Sheet Icons "cannot use Windows authentication at all". That is
  no longer true from this release. Rewrite it as: a form-login virtual proxy is one fix, and
  `--skip-login` is the other, when the account running Butler Sheet Icons is one Qlik Sense should
  sign in. Link here.
- The QSEoW options reference. Regenerate its table with
  `npm run docs:cli-tables -- --command "qseow create-sheet-thumbnails"`: `--skip-login` is new,
  and the three logon options are no longer mandatory. Do the same for
  `qscloud create-sheet-thumbnails`.
- Any page that lists `--logonuserdir`, `--logonuserid` and `--logonpwd` as always required.

**Suggested placement.** A new page under the QSEoW guide, next to the authentication material,
with the Cloud section either kept here or moved to the Cloud options page.
