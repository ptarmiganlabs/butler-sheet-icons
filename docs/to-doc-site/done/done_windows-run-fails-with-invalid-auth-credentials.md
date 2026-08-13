<!--
PUBLISHED 2026-08-13 to the doc site `next` branch, PRs
ptarmiganlabs/butler-sheet-icons-docs#85 and #86, as a section in guide/troubleshooting.md.

VERSION: the draft's "For the publisher" note says 4.2.0 throughout. The release is 5.0.0 -- the
Firefox removal made it a major. The draft told the publisher to re-check, and was right to. All
three version-dependent details were published as 5.0.0.

Only two of the draft's three version-dependent items belong on this page. The third -- the
spurious "closed from the other end, code 1000" warning on 4.1.0 -- went with the lost-connection
material instead.

Wording: the User-Agent decision diagram first labelled its branches "Macintosh, X11". Those are
User-Agent substrings, not platform names; #86 changed them to "macOS, Linux" and "Windows". The
TABLE still quotes `Macintosh; Intel Mac OS X` verbatim and must -- that column is what the header
contains, and it is what the curl check tells the reader to send.

No screenshot was published; an HTML comment marks where the QMC one would go.

VERIFYING A MERMAID CHANGE ON THE LIVE SITE: grepping the page HTML does not work. VitePress emits
<div class="mermaid"></div> empty and URL-encodes the diagram source into an assets/*.js chunk.
Fetch the page, extract the assets/guide_*.md.*.js reference, fetch that, and grep for the encoded
label (e.g. macOS%2C%20Linux).
-->

# QSEoW run fails on Windows with `ERR_INVALID_AUTH_CREDENTIALS`

A run that works from macOS or Linux can fail from Windows with an authentication error, using the
same command, the same credentials and the same Qlik Sense server. The cause is a Qlik Sense
virtual proxy setting, not a problem with Butler Sheet Icons, the network, or the credentials.

This is a troubleshooting topic for existing behaviour. There is no new option and nothing to
upgrade.

## What you see

```
error: QSEOW: qseowProcessApp: net::ERR_INVALID_AUTH_CREDENTIALS at https://sense.example.com/sense/app/ded8d27d-…
error: QSEOW PROCESS APP: Failed to process app ded8d27d-…: net::ERR_INVALID_AUTH_CREDENTIALS at https://sense.example.com/sense/app/ded8d27d-…
error: Failed to process 1 of 1 app(s)
```

The part to search for is `ERR_INVALID_AUTH_CREDENTIALS`.

::: tip Older versions print more
The output above is from 4.2.0 onwards. Up to and including 4.1.0 the first line reads
`QSEOW: qseowProcessApp (stack): Error: net::ERR_INVALID_AUTH_CREDENTIALS …` and is followed by a
stack trace — a long list of lines beginning `at`. That is the same failure, reported more noisily;
in 4.2.0 the stack moved to `--loglevel debug`.
:::

Everything before this point succeeds, which is what makes the failure confusing. The log will
already have shown that Butler Sheet Icons connected to the server, opened the app, read its name
and counted its sheets:

```
info: Created session to server sense.example.com, engine version is 12.2759.8
info: Opened app ded8d27d-…
info: App name: "Employee salaries"
info: Number of sheets in app: 1
info: Browser setup complete. Launching browser...
```

Those steps use the certificates supplied with `--certfile` and `--certkeyfile`, and they are
working. It is only the **browser** that cannot get in.

::: tip A line that is not the cause — on 4.1.0 and earlier
Up to and including 4.1.0, a `warning` about the engine session being
*"closed from the other end, code 1000"* usually appears just before the error, and on successful
runs as well. Ignore it: Butler Sheet Icons was reporting its own tidy-up, not a lost connection.
It was fixed in 4.2.0 and no longer appears.

From 4.2.0 a message of this kind means what it says — the connection to Qlik Sense really did
drop — and the code it quotes is worth including in a bug report.
:::

## Why it happens on Windows and not on macOS

Butler Sheet Icons signs in to Qlik Sense the same way a person does: it opens a browser, waits for
the login page, and types the user name and password from `--logonuserdir`, `--logonuserid` and
`--logonpwd`.

A Qlik Sense virtual proxy does not always serve that login page. Each virtual proxy has a setting
called **Windows authentication pattern**, and Qlik Sense matches it against the **User-Agent** that
the browser sends — the piece of text in which a browser states what it is and which operating
system it runs on. The default value of that setting is the word `Windows`.

A browser running on Windows announces itself with a User-Agent containing `Windows NT`. That
matches the default pattern, so Qlik Sense decides this visitor should use Windows authentication
and sends the browser to an NTLM login instead of the login page:

| Butler Sheet Icons runs on | User-Agent contains | Qlik Sense sends the browser to |
| --- | --- | --- |
| macOS | `Macintosh; Intel Mac OS X` | `/internal_forms_authentication/` — the login page |
| Linux | `X11; Linux x86_64` | `/internal_forms_authentication/` — the login page |
| Windows | `Windows NT 10.0; Win64; x64` | `/internal_windows_authentication` — NTLM |

Butler Sheet Icons cannot complete an NTLM login. The browser it runs has no window and no way to
ask anyone for credentials, so Windows quietly offers whatever account the machine is signed in as.
On a machine that is not domain-joined — or is signed in as the wrong user — Qlik Sense rejects
that account, the browser has nothing else to offer, and it gives up with
`ERR_INVALID_AUTH_CREDENTIALS`.

The same command from macOS never matches the pattern, gets the login page, and works.

## The fix

Run Butler Sheet Icons against a virtual proxy whose **Windows authentication pattern** cannot match
a browser. The convention is to set it to `Form`, because no browser's User-Agent contains that
word, so every visitor is given the login page.

::: warning Use a separate virtual proxy — do not change your existing one
Changing the pattern on the virtual proxy your users log in through will **turn off Windows
single sign-on for all of them**. They will get a login page instead of being signed in
automatically.

Create a virtual proxy for Butler Sheet Icons instead, and leave the one your users rely on alone.
:::

In the QMC:

1. Go to **Virtual proxies** and create a new virtual proxy, or select an existing one used only for
   this purpose.
2. Under **IDENTIFICATION**, give it a **Prefix**. Any valid prefix will do — the name has no
   meaning to Butler Sheet Icons. The examples below use `form`.
3. Under **AUTHENTICATION**, set **Windows authentication pattern** to `Form`.
4. Leave **Authentication method** as `Ticket`. This is not the setting that needs changing, and a
   proxy that already says `Ticket` can still send Windows users to NTLM — the pattern is what
   decides.
5. Link the virtual proxy to your proxy service, and apply the changes.

Then tell Butler Sheet Icons to use it, with the prefix you chose:

```
--prefix form
```

or as an environment variable:

```
BSI_QSEOW_CST_PREFIX=form
```

::: tip Slashes around the prefix are ignored — from 4.2.0
Write it as `form`, `/form` or `/form/` — all three name the same virtual proxy and all three work.

In releases up to and including 4.1.0 they did not. A prefix written with the leading slash it has
in the browser address bar produced a doubled separator in the URL
(`https://sense.example.com//form/sense/app/…`), which logged in perfectly well and then failed
about ninety seconds later with `Waiting for selector '#qv-page-container' failed` — an error that
named a page element rather than the prefix that caused it. If you are on 4.1.0 or earlier, write
the prefix without slashes.
:::

::: warning The prefix is not the fix
`--prefix form` on its own changes nothing. A virtual proxy called `form` whose **Windows
authentication pattern** is still `Windows` fails in exactly the same way. The pattern is what
matters; the prefix just tells Butler Sheet Icons which proxy to use.
:::

## Checking a virtual proxy without running Butler Sheet Icons

You can ask the server directly which login it would offer. The important part is to send a Windows
User-Agent — otherwise the tool you test with gets the login page regardless, and the test tells you
nothing.

Replace the host, the prefix and the app ID with your own. Omit the `/form` part to test the default
virtual proxy.

```powershell
curl.exe -sk -o NUL -D - -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" `
  "https://sense.example.com/form/sense/app/ded8d27d-…"
```

```bash
curl -sk -o /dev/null -D - -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
  "https://sense.example.com/form/sense/app/ded8d27d-…"
```

Read the `Location:` line in the reply:

| `Location` contains | Meaning |
| --- | --- |
| `internal_forms_authentication` | The login page. Butler Sheet Icons will work through this proxy. |
| `internal_windows_authentication` | NTLM. Butler Sheet Icons will fail with `ERR_INVALID_AUTH_CREDENTIALS`. |

On Windows, use `curl.exe` rather than `curl` — in PowerShell, `curl` is a built-in alias for
something else and does not accept these options.

## What this means in general

Butler Sheet Icons always expects the Qlik Sense login page. It cannot use Windows authentication at
all — not from a domain-joined machine, and not with a correct domain account. On a virtual proxy
that serves NTLM, a run either fails as described above or, if Windows single sign-on happens to
succeed, fails while waiting for a login page that never appears.

A virtual proxy that serves the login page to every visitor is therefore a requirement for
Butler Sheet Icons, on every platform. It only becomes visible on Windows, because that is the only
platform where the default pattern matches.

---

<!-- Notes for the publishing pass — not for the site -->

## For the publisher

**Version gate:** no whole-page gate. The Qlik Sense behaviour this page is about — a virtual proxy
choosing NTLM from the User-Agent — has always been the case and is not tied to a BSI release. Do
not wrap the page in `::: warning Requires BSI X.Y.Z or later`.

**Three things on the page are version-dependent, and all three are 4.1.0 vs 4.2.0.** They are
already written that way; this note exists so a later editor does not have to rediscover why:

| On the page | Through 4.1.0 | From 4.2.0 | Shipped by |
| --- | --- | --- | --- |
| First line of the error output | `QSEOW: qseowProcessApp (stack): Error: net::ERR_…` plus a full stack trace | `QSEOW: qseowProcessApp: net::ERR_…`, stack only at `--loglevel debug` | #1032 |
| A prefix written `/form` | Doubled separator in the URL; fails 90s later on `#qv-page-container` | Slashes stripped, works | #1033 |
| `closed from the other end, code 1000` | Printed on every run, successful ones included | Gone; the message now only appears for a real drop | #1035 |

4.2.0 is the release: `.release-please-manifest.json` reads 4.1.0, and the open release PR (#974)
is titled `chore(main): release butler-sheet-icons 4.2.0`. The commits since `v4.1.0` include
`feat` entries and carry no `BREAKING CHANGE` or `!` markers, so the minor bump is what the
changelog tooling will produce.

**Re-check these three before publishing** if more releases have gone out in the meantime. Each was
correct when written and invalidated by the next fix to land — that is the failure mode this table
is meant to prevent, not a hypothetical.

**Verified against the implementation** and against a live QSEoW 12.2759.8 server:

- The redirect difference was confirmed by requesting the same app URL twice, changing only the
  User-Agent. `/internal_windows_authentication/` answers `401 WWW-Authenticate: NTLM`.
- The QRS API confirms the two proxies involved. Both have `authenticationMethod: 0` (Ticket); they
  differ only in `windowsAuthenticationEnabledDevicePattern`, which is `Windows` on the default
  proxy and `Form` on the working one. This is why step 4 above tells the reader not to touch
  **Authentication method**.
- `--prefix <prefix>` / `BSI_QSEOW_CST_PREFIX`, default `''`, confirmed in
  `src/lib/commands/qseow/index.js`.
- The quoted error lines are verbatim from a real failing run.

**Suggested placement.** Prefer editing `docs/guide/troubleshooting.md` over adding a page:

- Add this as a symptom-keyed subsection under **QSEoW Authentication Problems**, and add
  `net::ERR_INVALID_AUTH_CREDENTIALS` to that section's **Symptoms** list — today it lists only
  "Certificate errors / Access denied / Connection timeouts", none of which an admin hitting this
  would match on.
- That section already carries a `--prefix form` snippet under *Virtual Proxy Configuration*,
  commented `# Ensure you're using form-based authentication`. It is correct but unexplained, and
  reads as though a proxy named `form` is a Sense built-in. Replace it with a pointer to the new
  subsection.
- Cross-link from **Browser Login and Navigation Issues**, whose listed symptom "Login page loads
  but credentials aren't entered" is what an admin may well match on first.

**Screenshot.** A QMC screenshot of the field is available from the investigation — *Edit virtual
proxy* showing description `Central node, Windows form auth`, prefix `form`, **Authentication
method** `Ticket` and **Windows authentication pattern** `Form`. Worth including at step 3; the
field is easy to miss among the other AUTHENTICATION settings.

**Known limitation worth an issue.** The failure message names neither the virtual proxy nor the
pattern, so nothing in the output points an admin here. Making Butler Sheet Icons recognise
`ERR_INVALID_AUTH_CREDENTIALS` and say so is tracked separately.
