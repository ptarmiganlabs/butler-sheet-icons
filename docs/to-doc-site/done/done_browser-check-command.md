# `browser check`: find out whether a server can take screenshots

<!--
PUBLISHED 2026-08-14, doc site PR #99, merged to `next` as be8f742.

Published to four pages:
  /reference/browser                    new "### check" section, first under Commands
                                        Reference; `check` row in Available Commands;
                                        now troubleshooting step 1
  /guide/troubleshooting                quick diagnostic step 4 replaced; pointers added
                                        to five symptom sections it diagnoses
  /reference/commands                   `browser check` row in Quick Reference
  /guide/concepts/browser-detection-and-environment-variables
                                        confirmation step in the Strategy 3 staging
                                        procedure, plus a run-as-the-service-account tip

Corrections to this draft, recorded so they do not resurface:

- "Suggested target pages" names an "air-gapped installation guide". No such page
  exists on the doc site — docs/guide/advanced/ holds browser-cache-directory, ci-cd,
  crash-dumps, docker and proxy. The staging cross-link went to the browser detection
  concept page instead, which is where Strategy 3 lives. Note that seven findings in
  src/lib/doctor/checks/ carry `docs: 'guide/advanced/air-gapped-installation'`, which
  points at the same non-existent page; it is not rendered today, so no user sees a
  dead link, but it will be one as soon as anything resolves that field to a URL.

- "Status: new command, not yet on the doc site" was true when written; the version
  gate published is 5.0.0, taken from the open release-please PR title rather than from
  this draft. A `feat!` in the same window makes the next release major, not 4.2.0.

Everything else verified as correct against the merged implementation (44209d8): the
option table is byte-identical to what `docs:cli-tables` generates, and every message
string, report label, `Result:` sentence and exit code was reproduced by running the
command rather than read from this file.
-->

**Status:** new command, not yet on the doc site.
**Suggested target pages:** a new section under `/reference/browser`, plus a link from the air-gapped installation guide and from the troubleshooting pages.

> **Note for the publishing pass.** Every message string, log line and remediation sentence below was captured from a real run of the command. Only the environment-specific values — paths, user names, the machine's platform and browser build ids — have been changed to a plausible Windows Server example, since the audience runs Qlik Sense on Windows and the capture machine was a Mac. Do not reword the message text: administrators search for it verbatim.

---

## What it is

`butler-sheet-icons browser check` answers one question: **will a real thumbnail run work on this machine?**

It answers it without contacting Qlik Sense, without changing anything, and without making a single network request. It is safe to run on a production Qlik Sense server at any time, and safe to give to a customer as the first troubleshooting step.

Until now, the only way to find out whether a Butler Sheet Icons installation could actually drive a browser was to run a full thumbnail job against a production Qlik Sense environment and see what happened. On a server with no internet access — which is most Qlik Sense servers in regulated organisations — a browser problem showed up as a failure late in the run, with an error message that said nothing about browsers.

Run it like this:

```
butler-sheet-icons browser check
```

## What it checks

Five things, in the order they matter:

1. **The machine and the account.** Which operating system, which user Butler Sheet Icons is running as, where that user's home directory is, and which directory the command was started from.
2. **The browser executable**, if you have configured one with `--browser-executable-path` or the `BSI_BROWSER_EXECUTABLE_PATH` environment variable. Is it where you said it is?
3. **The browser cache** — where it is, whether this account can read it, whether it will be consulted at all, and which browser builds are in it. Each build is reported as usable or not usable, with the reason.
4. **The selection** — which browser a real run would actually pick, and where it is.
5. **The launch test** — the selected browser is started and asked for its version number, then closed again. No web page is opened and nothing is navigated to.

The last one is the point. A browser file being in the right place proves much less than the browser actually starting: antivirus software, missing system libraries and browser builds that Butler Sheet Icons cannot drive all produce a browser that looks perfectly fine on disk and fails the moment it is used.

## How to read the output

The output has two parts, and telling them apart saves confusion.

**The report** starts at the line `Butler Sheet Icons browser check` and runs to the end of the output — the `Result:` line, and the numbered `Next steps:` that follow it when the run failed. Paste all of it into a support request.

**Above the report** are a few lines from the steps the command runs on the way there — the Butler Sheet Icons version, and then the browser-detection step's own log output. Those are shared with a real thumbnail run: they are exactly what a real run prints at that point, which is deliberate, because it means the check reproduces what you would see in a failing job.

That has one consequence worth knowing about in advance. When no staged browser matches, the detection step prints this:

```
warn: No cached chrome build matches --browser-version "recommended" (build 151.0.7922.71). Cached chrome builds that this machine can run: 151.0.7922.138. Set --browser-version to one of those build ids to use it instead. Butler Sheet Icons will now try to download chrome 151.0.7922.71, which needs internet access. On a machine without internet access this will fail.
```

**`browser check` does not download anything, and does not make that request.** That sentence describes what a *real thumbnail run* would do next, because the same detection step is shared with the run. The check stops there and reports; nothing after that line reaches the network.

## The exit code

`browser check` sets the exit code, so it can be used as a gate in a deployment script:

- **0** — a browser was found and, unless you passed `--skip-launch`, started successfully.
- **1** — no usable browser was found, the browser could not be started, or a setting is wrong in a way that would stop a real run.

For example, in a PowerShell deployment script on a Qlik Sense server:

```powershell
.\butler-sheet-icons.exe browser check
if ($LASTEXITCODE -ne 0) {
    Write-Error "Butler Sheet Icons cannot take screenshots on this server. See the output above."
    exit 1
}
```

## A healthy server

This is what a working server looks like. Note that the command reports facts even when everything is fine — that is deliberate, because it is what lets you rule things out, and it makes the output useful to paste into a support request.

```
info: Butler Sheet Icons browser check
info: Environment
info:     Platform            : win32 x64 (Puppeteer platform "win64")
info:     Running as user     : svc_qlik
info:     Home directory      : C:\Users\svc_qlik
info:     Working directory   : C:\butler-sheet-icons
info:     Standalone binary   : true
info: Browser executable
info:     Configured          : no
info: Browser cache
info:     Source              : default location next to the Butler Sheet Icons executable
info:     Directory           : C:\butler-sheet-icons\browser-cache
info:     Directory exists    : yes
info:     In use              : yes
info:     Cached builds       : 1
info:         chrome 151.0.7922.71     platform=win64     executable present   usable
info: Selection
info:     Requested           : chrome recommended (build 151.0.7922.71)
info:     Would use           : cached browser (chrome 151.0.7922.71)
info:     Executable          : C:\butler-sheet-icons\browser-cache\chrome\win64-151.0.7922.71\chrome-win64\chrome.exe
info: Launch test
info:     Launched            : yes
info:     Reported version    : Chrome/151.0.7922.71
info: Note: these findings are best-effort. Butler Sheet Icons reports what it can observe on this
info: machine, and cannot see everything about your environment - group policy, antivirus, proxy rules
info: and Qlik Sense itself are all invisible to it. Review suggested commands before running them on a
info: production server.
info: Result: OK - Butler Sheet Icons can take screenshots on this machine without internet access.
```

Three lines here are worth more attention than they look:

**`Running as user`, `Home directory` and `Working directory`.** If Butler Sheet Icons runs as a Windows scheduled task under the LocalSystem account, the home directory is `C:\Windows\system32\config\systemprofile` and the working directory is `C:\Windows\system32` — not the folder you installed it in. A browser cache staged into your own user profile is invisible to that account, and a `.env` file placed beside the executable is never read. Both symptoms are baffling until you see these three lines.

**`In use`.** When you have configured a browser executable and that file exists, the browser cache is never consulted. The line then reads `no (an executable path is configured, so the cache is not consulted)`, which tells you the cache directory setting is being ignored on purpose rather than silently failing.

**The best-effort note.** It appears on every run and cannot be switched off. Butler Sheet Icons is reasoning from what it can observe on one machine; it cannot see group policy, antivirus rules, proxy configuration, or anything about your Qlik Sense installation itself.

## A server that cannot take screenshots

```
info: Butler Sheet Icons browser check
info: Environment
info:     Platform            : win32 x64 (Puppeteer platform "win64")
info:     Running as user     : svc_qlik
info:     Home directory      : C:\Windows\system32\config\systemprofile
info:     Working directory   : C:\Windows\system32
info:     Standalone binary   : true
info: Browser executable
info:     Configured          : no
info: Browser cache
info:     Source              : from --browser-cache-dir / BSI_BROWSER_CACHE_DIR
info:     Directory           : D:\qlik\bsi-browser-cache
info:     Directory exists    : yes
info:     In use              : yes
info:     Cached builds       : 1
info:         chrome 151.0.7922.71     platform=mac_arm   executable present   not usable (built for another platform)
error:     The cache at D:\qlik\bsi-browser-cache holds 1 chrome build(s), for mac_arm. This machine is win64. A browser cache copied from a machine with a different operating system cannot be used.
info: Selection
info:     Requested           : chrome recommended (build 151.0.7922.71)
info:     Would use           : nothing - a browser would have to be downloaded
info: Note: these findings are best-effort. Butler Sheet Icons reports what it can observe on this
info: machine, and cannot see everything about your environment - group policy, antivirus, proxy rules
info: and Qlik Sense itself are all invisible to it. Review suggested commands before running them on a
info: production server.
error: Result: FAILED - the cached browsers were built for a different operating system
error: Next steps:
error:     1. Stage the browser from a machine running the same operating system as this one, and copy that machine's browser cache directory here.
error:        butler-sheet-icons.exe browser install --browser chrome --browser-version recommended
error:     2. Or, if Chrome or Edge is already installed on this machine, point Butler Sheet Icons at it with --browser-executable-path or BSI_BROWSER_EXECUTABLE_PATH.
```

This is the most common air-gapped staging mistake, and the report names it exactly: the browser was downloaded on a Mac and copied to a Windows server. A browser build is compiled for one operating system and cannot run on another. **Always stage the browser from a machine running the same operating system as the target server.**

Read the failure output in three parts:

- The **`error:` lines within the report** say what was observed, with the actual values — which directory, which builds, which platform.
- The **`Result: FAILED` line** names the single most important problem in one sentence.
- The **`Next steps`** are ordered, and the first one is the one to try.

The suggested commands are shown for the operating system you are on: PowerShell commands on Windows, shell commands on macOS and Linux. Steps are never repeated: when one problem explains another, only the one you can act on carries advice.

## Other things it catches

### A browser executable path that points nowhere

If you set `--browser-executable-path` or `BSI_BROWSER_EXECUTABLE_PATH` to a file that does not exist, Butler Sheet Icons deliberately stops rather than quietly downloading a different browser instead. This is the single most useful thing `browser check` catches, because it means an explicit setting is wrong:

```
info: Browser executable
info:     Source              : from --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH
info:     Path                : D:\Chrome\chrome.exe
info:     Exists              : no
error:     --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH is set to "D:\Chrome\chrome.exe", and no such file exists on this machine. Butler Sheet Icons will not fall back to downloading a browser when an executable path has been given explicitly, so every thumbnail run will stop here.
info: Browser cache
info:     Source              : default location next to the Butler Sheet Icons executable
info:     Directory           : C:\butler-sheet-icons\browser-cache
info:     Directory exists    : yes
info:     In use              : no (an executable path is configured but missing, so detection stops before the cache)
...
error: Result: FAILED - the configured browser executable does not exist
error: Next steps:
error:     1. Correct the path so it names a browser that exists on this machine, or remove the setting to let Butler Sheet Icons find a browser itself. On Windows, Google Chrome is usually at C:\Program Files\Google\Chrome\Application\chrome.exe and Microsoft Edge at C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe.
```

Note the `In use` line: because the path was given explicitly and is missing, Butler Sheet Icons stops there and never looks in the cache at all. Staging a browser into that cache would not help until the path is corrected or removed.

### A browser cache this account cannot read

The one that looks like an empty cache and is not. A cache staged by an administrator, under a Windows scheduled task running as LocalSystem, is often unreadable by the account Butler Sheet Icons actually runs as:

```
info: Browser cache
info:     Source              : from --browser-cache-dir / BSI_BROWSER_CACHE_DIR
info:     Directory           : D:\qlik\bsi-browser-cache
info:     Directory exists    : yes
info:     In use              : yes
info:     Cached builds       : 0
error:     Butler Sheet Icons could not read D:\qlik\bsi-browser-cache. Whatever browsers are staged there, this account cannot see them, so a real run would behave as though the cache were empty. The error was: EPERM: operation not permitted, scandir 'D:\qlik\bsi-browser-cache\chrome'
...
error: Result: FAILED - the browser cache directory could not be read
error: Next steps:
error:     1. Check that the account this runs as (svc_qlik) can read D:\qlik\bsi-browser-cache and everything under it. A cache staged from an administrator's own profile is the usual cause - under a Windows scheduled task Butler Sheet Icons often runs as LocalSystem, not as the person who staged it.
error:     2. Or move the browser cache somewhere the service account can read, and point Butler Sheet Icons at it with --browser-cache-dir or BSI_BROWSER_CACHE_DIR.
```

Read this together with the `Running as user` line in the Environment block. Those two lines together are usually the whole diagnosis.

### A browser version that is not the one you staged

If the cache holds a browser but not the exact build being asked for, `browser check` says so and tells you which build ids you do have:

```
info: Selection
info:     Requested           : chrome recommended (build 151.0.7922.71)
info:     Would use           : nothing - the requested build would have to be downloaded
error:     chrome recommended (build 151.0.7922.71) was requested, and C:\butler-sheet-icons\browser-cache holds no such build. It does hold 1 build(s) this machine can run: chrome 151.0.7922.138. A real run would try to download the requested build, which needs internet access.
...
error: Result: FAILED - the requested browser build is not in the cache, although other builds are
error: Next steps:
error:     1. Use one of the builds already on this machine: set --browser-version to 151.0.7922.138, or set the matching BSI_*_BROWSER_VERSION environment variable.
error:        butler-sheet-icons.exe browser check --browser-version 151.0.7922.138
error:     2. Or, on a machine with internet access and the same operating system as this one, install the requested build and copy the browser cache directory here.
error:        butler-sheet-icons.exe browser install --browser chrome --browser-version recommended
```

This matters because Butler Sheet Icons asks for one specific browser build, not "any browser". Staging a browser today and upgrading Butler Sheet Icons next month can leave you with a cache that is full and still unusable — and the fix is usually step 1, not a new download.

### A cache holding a different browser

The default cache directory is shared with any other tool on the machine that uses the same browser library, so it can fill up with builds Butler Sheet Icons never looks at. Those are reported as present but not usable:

```
info:     Cached builds       : 1
info:         chrome-headless-shell 151.0.7922.71 platform=win64     executable present   not usable (a chrome-headless-shell build, not the chrome build this run needs)
```

Run with `--loglevel verbose` to see the summary of each check as well as its facts, which states the same conclusion in a sentence:

```
verbose:     The browser cache holds no chrome builds
```

### A browser that starts but cannot be driven

Some browser builds start perfectly well and then stop responding to the first command sent to them. The report distinguishes this from a browser that never started, because the fix is completely different — a different build, not an antivirus exclusion:

```
info: Launch test
info:     Launched            : yes
info:     Responded           : no
info:     Build               : 151.0.7922.71
error:     The browser at C:\butler-sheet-icons\browser-cache\chrome\win64-151.0.7922.71\chrome-win64\chrome.exe started and then stopped responding on the first command sent to it. The process is fine; this build cannot be driven. A real run fails the same way, part-way through a sheet. The error was: Protocol error (Browser.getVersion): Session closed.
error: Result: FAILED - the browser starts but cannot be driven by Butler Sheet Icons
```

### A browser that starts, but far too slowly

This one passes and still tells you something. If starting the browser takes longer than Butler Sheet Icons allows for, the check reports it as a warning while still returning exit code 0:

```
warn:     Starting the browser took 92s, longer than the 30s launch timeout allows for. It worked this time, so this check passes - but a real run can exceed the timeout on the same machine and fail with an error naming none of this.
```

On Windows this is almost always antivirus or endpoint protection scanning a browser executable it has not seen before. Excluding the Butler Sheet Icons browser cache directory from real-time scanning avoids it. Worth acting on: a run that is merely slow today is a run that fails intermittently tomorrow.

### Which `--browser-version` values work offline

Not every way of naming a browser version survives on a server with no internet access, and `browser check` treats them differently because a real thumbnail run does.

| What you set | Offline | Reported as |
| --- | --- | --- |
| `recommended` (the default) | Works. Resolves from a value built into Butler Sheet Icons. | nothing to report |
| A full build id, e.g. `151.0.7922.77` | Works. Names one build, no lookup needed. | nothing to report |
| `stable`, `beta`, `dev`, `canary` | Works, but you may get a different build than a connected machine would. Butler Sheet Icons falls back to the newest suitable build already staged. | a warning |
| A milestone or partial id, e.g. `151` or `151.0.7922` | **Does not work.** There is no fallback for this form, so a real run stops with a lookup error before it looks at the cache. | a failure |

That last row is worth reading twice, because it is the surprising one — a partial version looks more precise than `stable`, and offline it is the one that cannot work:

```
info:     Requested           : chrome 151
info:     Would use           : cached browser (chrome 151.0.7922.138)
info:     Requested version   : 151
error:     --browser-version "151" names a milestone or a partial build id, and turning that into a single build is the browser vendor's lookup. Butler Sheet Icons does not fall back to a cached build for this form - only for keywords such as "recommended" and "stable" - so a real run on a machine without internet access stops with a lookup error before it looks at the cache at all. Whatever this check reports about the browser here, a run with this setting cannot start offline.
...
error: Result: FAILED - the requested browser version can only be resolved over the internet
```

Note the report still shows which browser it *would* have used. That is not a contradiction: the browser is there and is fine — the version setting is what stops the run.

A floating keyword is only a warning, because a real run does fall back to what is staged:

```
warn:     --browser-version "stable" names whichever build is newest at the time it runs, which can only be resolved over the internet. This check did not make that call, so it accepted the newest suitable build already present instead. A real run on a machine with internet access may therefore choose a different build than the one reported here.
```

### A cache copied without the browser binaries

Some copy tools skip hidden files by default. A browser cache copied that way looks complete — the folders are all there — but the browser itself is missing:

```
info:     Cached builds       : 1
info:         chrome 151.0.7922.71     platform=win64     executable MISSING   not usable (executable not found on disk)
error:     1 of 1 cached chrome build(s) in D:\qlik\bsi-browser-cache have no browser binary where one should be: chrome 151.0.7922.71 (expected at D:\qlik\bsi-browser-cache\chrome\win64-151.0.7922.71\chrome-win64\chrome.exe). The cache directory is incomplete - copied without the browser binary, or left behind by a failed install.
...
error: Result: FAILED - cached browsers are missing their executable files
error: Next steps:
error:     1. Copy the browser cache directory again, preserving hidden files - a tar or robocopy invocation that skips dotfiles leaves the .metadata file behind and produces exactly this.
error:     2. Or install the browser again on a machine with internet access, and copy the whole cache directory here.
error:        butler-sheet-icons.exe browser install --browser chrome --browser-version recommended
```

## Options

<!-- generated:cli-options browser check -->

| Option                             | Environment Variable            | Description                                                                                                                                                                                                                                                                                                                                                                         | Default       | Example            |
| ---------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------ |
| `--log-level, --loglevel <level>`  | `BSI_BROWSER_C_LOG_LEVEL`       | Log level (choices: error, warn, info, verbose, debug, silly)                                                                                                                                                                                                                                                                                                                       | `info`        | `--loglevel error` |
| `--browser <browser>`              | `BSI_BROWSER_C_BROWSER`         | Browser to check for. Only "chrome" is supported. (choices: chrome)                                                                                                                                                                                                                                                                                                                 | `chrome`      | `--browser chrome` |
| `--browser-version <version>`      | `BSI_BROWSER_C_BROWSER_VERSION` | Browser build to check for. Either a keyword - "recommended" for the build Butler Sheet Icons is tested with, "stable" for the newest stable release, or a release channel such as "beta" - or an exact version: a milestone ("151"), a build prefix ("151.0.7922") or a full build id ("151.0.7922.77"). Use "butler-sheet-icons browser list-available" to see what is available. | `recommended` | -                  |
| `--browser-cache-dir <directory>`  | `BSI_BROWSER_CACHE_DIR`         | Directory where Butler Sheet Icons keeps downloaded browsers. Defaults to a "browser-cache" folder next to the Butler Sheet Icons executable for standalone builds, and to the .cache/puppeteer folder in the current user's home directory otherwise.                                                                                                                              | -             | -                  |
| `--browser-executable-path <path>` | `BSI_BROWSER_EXECUTABLE_PATH`   | Full path to a browser executable to use, for example a Microsoft Edge or Google Chrome already installed on this machine. Butler Sheet Icons then neither downloads nor manages a browser. Takes precedence over PUPPETEER_EXECUTABLE_PATH. If the file does not exist the run stops rather than downloading a browser instead.                                                    | -             | -                  |
| `--headless <true\|false>`         | `BSI_BROWSER_C_HEADLESS`        | Headless (=not visible) browser (true, false)                                                                                                                                                                                                                                                                                                                                       | `true`        | -                  |
| `--skip-launch [true\|false]`      | `BSI_BROWSER_C_SKIP_LAUNCH`     | Find a browser but do not start it. Faster, and useful where starting a browser is not allowed - but it leaves the most valuable part of the check undone.                                                                                                                                                                                                                          | `false`       | -                  |
| `-h, --help`                       | -                               | display help for command                                                                                                                                                                                                                                                                                                                                                            | -             | `-h`               |

<!-- /generated:cli-options -->

Pass the same browser options you use for your real thumbnail runs. If your `qseow create-sheet-thumbnails` command sets `--browser-cache-dir`, set it here too — otherwise the check reports on a different browser cache than the one your real runs use, and a pass here proves nothing about them.

`--headless false` is worth trying if headless runs behave oddly: starting a visible browser on a server with no display is a genuinely different test, and it fails in a way a headless launch does not.

**Both true/false options accept the same words, and refuse anything else.** `true`, `1`, `yes` and `on` all mean on; `false`, `0`, `no` and `off` all mean off; case does not matter. A value neither list recognises is rejected with an error rather than quietly guessed at, so a typo in a scheduled task shows up as a failed command instead of a silently different test:

```
error: option '--headless <true|false>' argument 'maybe' is invalid. "maybe" is not a true/false value. Use one of: true, 1, yes, on - or false, 0, no, off.
```

`--skip-launch` can be written as a bare flag or with a value: `--skip-launch`, `--skip-launch true` and `BSI_BROWSER_C_SKIP_LAUNCH=true` all skip the launch test, while `--skip-launch false` and `BSI_BROWSER_C_SKIP_LAUNCH=false` run it. An environment variable set but left empty — `BSI_BROWSER_C_SKIP_LAUNCH=` — means "unset", so the option keeps its default.

When the launch test is skipped, the result line says so rather than claiming more than was checked:

```
info: Result: OK - a browser was found on this machine. It was not started, so whether it runs here is untested.
```

## What it deliberately does not do

- **It makes no network requests of its own.** This is a hard rule, not a side effect: a diagnostic that hangs waiting for a DNS lookup on an air-gapped server is worse than no diagnostic at all. The check never downloads a browser and never contacts the browser vendor, even when the report says a real run would have to. See [How to read the output](#how-to-read-the-output) for the one log line that can look otherwise.

  One consequence is visible in the report. Working out which build `--browser-version stable` or `--browser-version 151` refers to is a lookup only the browser vendor can answer, so the check does not make it — and how much that matters depends on which of the two you wrote. See [Which `--browser-version` values work offline](#which-browser-version-values-work-offline) below.

  `--browser-version recommended` — the default — needs no lookup at all, which is why it is the default.

- **It never contacts Qlik Sense.** It tells you nothing about whether your certificates, virtual proxy or credentials are correct.
- **It changes nothing.** It installs nothing, downloads nothing and deletes nothing.
- **It does not open a web page.** The browser is started, asked for its version, and closed.

## When to run it

- **After installing Butler Sheet Icons on a new server**, before scheduling anything.
- **After staging a browser** on an air-gapped server, to confirm the copy worked — this is the step that used to require a full production thumbnail run.
- **As the same account the scheduled task uses.** Running it as yourself proves very little about a task that runs as LocalSystem; the `Running as user` line is there to make that difference visible.
- **As the first step when a thumbnail run fails.** If `browser check` passes, the browser is not your problem, and you can look at Qlik Sense connectivity instead.
- **In a deployment script**, as a gate.
- **When opening a support issue.** Paste the whole output, including the lines above the report. It is the single most useful thing you can attach to a browser-related bug report: it says what operating system, which account, which directories, which browser builds and whether the browser starts.
