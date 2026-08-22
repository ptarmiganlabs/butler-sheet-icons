# The tenant URL and server host now accept a pasted URL

Butler Sheet Icons documents `--tenanturl` as taking either a full URL or a bare host name:

```
--tenanturl <url>   URL or host of Qlik Sense cloud tenant.
                    Example: "https://tenant.eu.qlikcloud.com" or "tenant.eu.qlikcloud.com"
```

Until now only the bare host really worked. Both forms now do, on Qlik Sense Cloud and on Qlik
Sense Enterprise on Windows alike, and `--host` says so in its own help text.

::: warning Requires BSI X.Y.Z or later
:::

## What used to happen

With `https://` in front of the tenant URL, a run got further than it should have. The startup
checks are all made over the Qlik REST API, which accepted the value, so the run header confirmed
the tenant with a green tick and listed the apps it was about to update:

```
  ✓ tenant            https://plabs.eu.qlikcloud.com
  ✓ app list          1 apps · 1 named
```

The first app then failed:

```
warn: CLOUD PROCESS APP: The engine session to Qlik Sense Cloud tenant https://plabs.eu.qlikcloud.com was closed from the other end, code 1006. Whatever is still using this session will fail from here on.
error: CLOUD APP: getaddrinfo ENOTFOUND https
✗ 1/1  5838acc6-1139-4a3...                failed        3s
```

`getaddrinfo ENOTFOUND https` is a DNS failure, and the name it could not look up is `https`. The
value was being used to build an address of the form `wss://https://plabs.eu.qlikcloud.com/...`,
which is not a valid address for anything. Nothing in that message named the option responsible,
and the green tick above it pointed away from the real cause.

The same applied to `--host` on Qlik Sense Enterprise on Windows, where a pasted server URL broke
the connection to the engine, to the repository service, and to the hub.

## What happens now

Butler Sheet Icons reads the value as a URL and keeps only the host name from it. All of these
mean the same thing:

| What you supply                    | What Butler Sheet Icons uses |
| ---------------------------------- | ---------------------------- |
| `tenant.eu.qlikcloud.com`          | `tenant.eu.qlikcloud.com`    |
| `https://tenant.eu.qlikcloud.com`  | `tenant.eu.qlikcloud.com`    |
| `https://tenant.eu.qlikcloud.com/` | `tenant.eu.qlikcloud.com`    |
| `HTTPS://Tenant.EU.Qlikcloud.com`  | `tenant.eu.qlikcloud.com`    |
| `http://tenant.eu.qlikcloud.com`   | `tenant.eu.qlikcloud.com`    |

The host name comes back in lower case, which is how DNS treats it anyway.

This applies wherever the value can be supplied - on the command line, through the environment
variable, in a `.env` file, and in the interactive wizard - and to every command that connects to
Qlik Sense: the three `qscloud` commands through `--tenanturl`, and the two `qseow` commands
through `--host`.

::: tip The scheme only names the host - it does not choose the protocol
Stripping `http://` does not turn off TLS. On Qlik Sense Enterprise on Windows the protocol is
decided by `--secure`, which defaults to `true`; a server that really is reached over plain
`http://` needs `--secure false` as before. On Qlik Sense Cloud the connection is always `https`.
:::

## What is still refused, and why

Only a host name is accepted. Anything else that can appear in a URL is refused at startup, with a
message that says what to do instead - because every one of those parts has its own option, and
silently dropping it would produce a run that fails later and far from the cause.

**A path**, which is the commonest case: a complete page address copied from the browser while
looking at an app.

```
error: option '--host <host>' argument 'https://sense.example.com/form/hub' is invalid. Enter the host on its own, for example "sense.example.com" - a path is not part of it. A virtual proxy prefix, if there is one, goes in --prefix.
```

On Qlik Sense Enterprise on Windows the `/form` part of such an address is often the virtual proxy
prefix, and that goes in `--prefix`. The hint says _if there is one_ on purpose: an address such as
`https://sense.example.com/hub` has a path but no prefix, and nothing from it belongs in `--prefix`.
On Qlik Sense Cloud the message is the same without the hint, naming `--tenanturl` and that
platform's example:

```
error: option '--tenanturl <url>' argument 'https://tenant.eu.qlikcloud.com/sense/app/x' is invalid. Enter the host on its own, for example "tenant.eu.qlikcloud.com" - a path is not part of it.
```

**A port**, as in `https://sense.example.com:8443`. The ports have their own options -
`--engineport`, `--qrsport` and, on `qseow create-sheet-thumbnails`, `--port` for the hub - and
each is appended to the host by the part of Butler Sheet Icons that uses it.

```
error: option '--host <host>' argument 'https://sense.example.com:8443' is invalid. A port is not part of the host - the ports have their own options. Enter the host on its own, for example "sense.example.com".
```

**Credentials**, as in `https://user:password@sense.example.com`. The logon user and the API user
have their own options. Butler Sheet Icons refuses a host that carries a password rather than
stripping it, and the message does not repeat the value - a host with a password in it would
otherwise be printed in every log line that names the server.

**A blank value.** An environment variable that is set but empty - a `BSI_QSEOW_CST_HOST=` line in
a `.env` file or a unit file - used to be accepted as a host, and the run then failed some way in.
It is now refused where it can be fixed, naming the variable:

```
error: option '--host <host>' value '' from env 'BSI_QSEOW_CST_HOST' is invalid. Enter the host, for example "sense.example.com".
```

## The wizard can now repair a bad value from `.env`

Until now, a value in `.env` that Butler Sheet Icons refused stopped `-i` before the wizard opened,
with the error above and nothing else - the wizard that exists to correct such values could not be
reached from the one situation that most needed it. That was true of every validated option, not
only the host: a mistyped `BSI_QSEOW_CST_ENGINE_PORT` did the same.

Now the wizard opens. It names the value it could not use, repeats the reason, and asks the
question with the rejected value pre-filled, so fixing it is an edit rather than a retype:

```
Supplied, but not usable as given, so asked about below:
  ✗ --host (from BSI_QSEOW_CST_HOST): Enter the host on its own, for example "sense.example.com" - a path is not part of it. A virtual proxy prefix, if there is one, goes in --prefix.
```

Choosing _Save the answers to .env_ at the end writes the corrected value back, so the next run
passes without being asked.

## For the doc site

The help text of `--host` changed on both `qseow` commands, so their generated option tables
need refreshing:

```bash
npm run docs:cli-tables -- ../butler-sheet-icons-docs/docs/reference/qseow.md --write
```

(adjust the page path to wherever the `qseow` option tables live). The `--tenanturl` description
is unchanged.
