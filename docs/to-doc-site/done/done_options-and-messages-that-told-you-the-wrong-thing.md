# Options and error messages that told you the wrong thing

Five fixes in this release share a theme: Butler Sheet Icons accepted something, or reported
something, that did not match what it actually did. Two options were silently ignored, two
checks blamed the wrong cause when they failed, and one message removed the word that would
have explained it.

Nothing about a run that already works changes. Read the section matching anything you recognise.

## Two options that never worked now do

`--skip-login` and `--port` have both been accepted by Butler Sheet Icons for a long time, and
both were silently ignored. Neither produced an error, so there was nothing to tell you the value
you supplied was going nowhere.

Both now work. If you have either of them in a script, a scheduled job, or an environment
variable, **read the section for it below before upgrading** — you are about to get the behaviour
you originally asked for, which may not be what your setup currently depends on.

### `--skip-login` — Qlik Sense Cloud

|                      |                                                      |
| -------------------- | ---------------------------------------------------- |
| Command              | `butler-sheet-icons qscloud create-sheet-thumbnails` |
| Environment variable | `BSI_QSCLOUD_CST_SKIP_LOGIN`                         |

The flag tells Butler Sheet Icons to go straight to the tenant URL instead of filling in the Qlik
Sense login page. It is for setups where the browser is signed in automatically — single sign-on,
for example.

**What happened before.** The flag was recorded but never read, so the login page was filled in
and submitted on every run, whether or not you asked to skip it.

**What happens now.** With `--skip-login`, no credentials are typed and no login button is
clicked. The log records the decision at the default log level:

```
Skipping login as --skip-login is set to true
```

**What to check.** If you have been passing `--skip-login` _and_ valid `--logonuserid` /
`--logonpwd`, your runs have been succeeding via the login form all along. They will now take the
skip path instead, and will only work if the browser really does arrive at the tenant already
signed in. If it does not, the run will fail at the app page rather than at the login page. Try
one app before a scheduled batch.

### `--port` — Qlik Sense Enterprise on Windows

|                      |                                                    |
| -------------------- | -------------------------------------------------- |
| Command              | `butler-sheet-icons qseow create-sheet-thumbnails` |
| Environment variable | `BSI_QSEOW_CST_PORT`                               |

This is the **web** port — the one you would type in a browser to reach the hub. It is a different
thing from `--engineport` (the engine, 4747 by default) and `--qrsport` (the repository API, 4242
by default), both of which have always worked.

**What happened before.** The value was validated and then discarded. The hub and app URLs were
always built without a port, so Butler Sheet Icons could only reach a Qlik Sense server published
on the standard port — 443 for https, 80 for http. On any other port it could not load the app at
all, and `--port` looked like it should have been the answer.

**What happens now.** The port is included in both URLs, ahead of any `--prefix` virtual proxy:

```
https://sense.example.com:8443/sense/app/<app id>
https://sense.example.com:8443/<prefix>/sense/app/<app id>
```

Leave `--port` unset and the URLs are unchanged from before — no port is added.

**What to check.** If you set `BSI_QSEOW_CST_PORT` at some point, saw no effect, and left it in
place, it will start taking effect now. Confirm the value matches the port your Qlik Sense
virtual proxy actually listens on, or remove it.

**Putting the port into `--host` is not a workaround**, and never was. That value is also used as
a bare host name for the engine connection and the repository API, each of which takes its port
separately from `--engineport` and `--qrsport`. A `--host` containing `:8443` breaks both of those
connections. `--port` is the only correct place for the web port.

## Three failures that named the wrong cause

Separately from the options above, three checks reported the wrong reason when they went wrong,
and each sent you looking in the wrong place. Nothing about a working run changes.

### An unreadable certificate is no longer called a missing one

Butler Sheet Icons checks the QSEoW certificate and key before it starts. That check asked only
whether the files exist, not whether it could read them, so a certificate with the wrong
permissions passed. The run then failed much later, inside the Qlik Sense engine connection, with
a TLS error that named neither the file nor the permission problem.

Worse, when the check itself could not be carried out, it reported the same "missing file"
result. You were told a certificate was missing when it was sitting exactly where you put it.

**Before**, a certificate the account could not read produced:

```
Missing certificate file(s). Aborting
```

**Now** it produces:

```
QSEOW CERT CHECK: Could not check the certificate files: Error: EACCES: permission denied, access '/path/to/client.pem'
CertError: Could not read the Qlik Sense certificate files
```

A genuinely absent file still reports `Missing certificate file(s)`, unchanged. The command still
fails and still exits non-zero either way — only the stated reason is different.

**What to check.** If a run has ever failed with a missing-certificate message you could not
explain, check the file permissions on the certificate and key. The account running Butler Sheet
Icons must be able to read both.

### A Qlik Sense server that answers badly is no longer called a missing content library

The content library check asked QRS for libraries matching the name you gave. It assumed the
answer would always be a list. Three things could arrive instead, and each produced a different
wrong conclusion:

| What came back                                                    | What you were told                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `403`, because the service account may not read content libraries | The content library does not exist                                                             |
| An error object from QRS                                          | The content library does not exist                                                             |
| An HTML error page from a reverse proxy                           | The content library **exists** — the run continued and uploaded thumbnails that could not land |

The third is the one worth knowing about: the run looked like it was working.

**Now** each is reported as what it is, naming the request:

```
QRS returned status 403 for "/contentlibrary?filter=(name eq 'BSI thumbnails')"
QRS returned an unusable response for "/contentlibrary?filter=(name eq 'BSI thumbnails')": expected a list, got string
```

A library that genuinely does not exist still reports exactly as before.

**What to check.** If you have seen "content library does not exist" for a library you can see in
the QMC, two causes are now distinguishable: the service account named by `--apiuserid` and
`--apiuserdir` may not have rights to read content libraries, or something between Butler Sheet
Icons and QRS — a reverse proxy or load balancer — is answering instead of Qlik Sense.

The same protection applies to the app lookup behind `--qliksensetag`, which previously failed
with an internal error naming nothing useful.

### Per-app lookups no longer fail as internal errors

Client-managed Qlik Sense only. Before generating thumbnails for an app, Butler Sheet Icons asks
QRS three questions: what the app is called, which of its sheets carry the tags named by
`--exclude-sheet-tag` and `--blur-sheet-tag`, and how the sheet ids in the repository map to the
ones the engine uses. All three assumed the answer would be a list.

When the answer was something else — an error object from QRS, or a reply from something other
than Qlik Sense sitting in front of it — each failed in its own unhelpful way:

| Lookup             | What you were told                                                                     |
| ------------------ | -------------------------------------------------------------------------------------- |
| Sheet id mapping   | `TypeError: mapRepoEngineSheetIdTmp1.forEach is not a function`                          |
| App name           | The run reported `App name: "undefined"` and **carried on**, generating thumbnails anyway |
| Tagged sheets      | A sheet count that was never real, then a failure part-way through the sheets            |

The middle one is the one worth knowing about: the run looked like it was working.

**Now** all three report the response as the problem, naming the request, and the app stops before
a browser is started or a Qlik Sense session is opened:

```
QRS returned an unusable response for "app?filter=id%20eq%20<app id>": expected a list, got string
```

Other apps in the same run are unaffected — the run continues to the next one and reports how many
failed, as it does for any other per-app failure.

**What to check.** Same as above: whether the account named by `--apiuserid` and `--apiuserdir`
may read apps and app objects, and whether something between Butler Sheet Icons and QRS is
answering instead of Qlik Sense.

An app that genuinely cannot be found is now named as that, rather than failing later inside the
Qlik Sense session:

```
QSEoW app <app id> was not found in the Qlik Sense repository. Check --appid, and that the account named by --apiuserdir/--apiuserid may read the app.
```

## A message that hid the one word you needed

Butler Sheet Icons strips secrets out of everything it writes — log lines, error messages, crash
dumps. Passwords, API keys and the `Authorization` header sent to Qlik Sense are replaced with
`[REDACTED]` before anything reaches disk or screen.

That stripping was too eager. It removed whatever word happened to follow `token`, `bearer` or
`basic`, whether or not the word was a secret — and ordinary English sentences contain those
words too.

The message you get when the Qlik Sense Cloud API key is empty was one of them.

**Before:**

```
CLOUD CREATE THUMBNAILS 2 (stack): Error: API token [REDACTED] is required
```

That reads as though Butler Sheet Icons found a token and hid it from you. It had not. The word
it removed was `parameter`, which was the part telling you what was actually wrong.

**Now:**

```
CLOUD CREATE THUMBNAILS 2 (stack): Error: API token parameter is required
```

Any message could be affected, not just this one. Phrases such as "no token available for
tenant" or "Basic authentication is required" lost a word the same way.

**Secrets are still removed.** An `Authorization` header is still redacted whatever follows it,
and so is anything that looks like a credential — a Qlik Sense Cloud API key, which is a long
mixed-case string with dots in it, is untouched by this change. What is now left alone is plain
lowercase text of the kind that only ever appears in a sentence. Passwords, API keys and
credentials in URLs are handled by separate rules that did not change at all.

**What to check.** Nothing, before or after upgrading. If you have ever seen `[REDACTED]` in the
middle of a sentence and wondered which secret of yours was in that log line, the answer is that
there was none — it was this.

**Where this message comes from.** The Qlik Sense Cloud commands accept the API key as
`--apikey` or as the environment variable `BSI_QSCLOUD_CST_APIKEY`. An environment variable that
is set but empty — a typo in a name, a secret store that returned nothing — passes the
"was it supplied?" check and fails this one instead. That is the common route to this message.
