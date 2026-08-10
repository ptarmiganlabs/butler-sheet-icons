# Two options that never worked now do

`--skip-login` and `--port` have both been accepted by Butler Sheet Icons for a long time, and
both were silently ignored. Neither produced an error, so there was nothing to tell you the value
you supplied was going nowhere.

Both now work. If you have either of them in a script, a scheduled job, or an environment
variable, **read the section for it below before upgrading** — you are about to get the behaviour
you originally asked for, which may not be what your setup currently depends on.

## `--skip-login` — Qlik Sense Cloud

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

## `--port` — Qlik Sense Enterprise on Windows

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
