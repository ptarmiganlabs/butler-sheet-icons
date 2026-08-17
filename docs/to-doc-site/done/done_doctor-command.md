> **Archived 2026-08-17.** Published to the doc site as `/reference/doctor` (butler-sheet-icons-docs
> PR #101, `next` branch), with the cross-link applied to the browser check section of
> `/reference/browser`. Not published from below: the sample transcripts' `info: App version: 4.1.0`
> lines (this folder's rule against version numbers in pasted output), the JSON sample's literal
> `"toolVersion": "4.1.0"` (replaced with a placeholder), and the draft's relative `.md` cross-link
> (replaced with the absolute extensionless form the site build requires). The proposed target path
> `guide/troubleshooting/doctor.md` did not match the site - troubleshooting is a single page - so
> the page lives under Reference beside the other command pages.

# `doctor`: ask Butler Sheet Icons what is wrong with this server

**Target page:** a new page under the same part of the site as `browser check`, for example
`guide/troubleshooting/doctor.md`. The existing `browser check` page should gain a short pointer to
it (suggested wording at the bottom of this draft).

**Audience:** a Qlik Sense administrator holding a Butler Sheet Icons run that failed, or one about
to put Butler Sheet Icons onto a new server and wanting to know in advance whether it will work.

---

## What it is

`butler-sheet-icons doctor` inspects the machine it is run on and reports what would stop Butler
Sheet Icons working, with the steps that fix each problem.

It is the general form of `browser check`. Where `browser check` answers one question — *can this
server take screenshots?* — `doctor` runs every check Butler Sheet Icons has, so it is the command
to reach for when a run has failed and you do not yet have a theory about why.

Both commands remain, and neither replaces the other. Run `browser check` when you already know the
problem is the browser. Run `doctor` when you do not know what the problem is.

Three things it does **not** do, and each is deliberate:

- **It never contacts Qlik Sense.** It is safe to run on a production server at any time of day.
- **It makes no network requests** unless you pass `--allow-network`. On a server with no internet
  access, a check that tried to reach out would not fail quickly — it would hang. Checks that need
  the network are skipped instead.
- **It does not diagnose Qlik Sense.** The boundary is Butler Sheet Icons' own operation. Whether
  Butler Sheet Icons can reach your Sense server is in scope; why that Sense installation is
  unhealthy is a question for the Qlik Management Console, not for this command.

## Running it

`doctor` on its own runs the checks, so the shortest form is the one to remember:

```
butler-sheet-icons doctor
```

`butler-sheet-icons doctor check` is the same thing written out in full, and is what you would put
in a script.

One thing to know about `--help`: `butler-sheet-icons doctor --help` describes the `doctor` family,
not the options. The options — which areas to check, JSON output, allowing network access — are
listed by:

```
butler-sheet-icons doctor check --help
```

## What it checks

Checks are grouped into **areas**. Today two areas have checks behind them:

| Area | What it looks at |
| --- | --- |
| `environment` | Which machine this is, which account Butler Sheet Icons is running as, that account's home directory and working directory, and whether this is the standalone binary. |
| `browser` | Where the browser cache is and whether it can be read, which cached browsers can run on this machine, whether a configured browser executable exists, which browser a real run would choose, and whether that browser actually starts. |

Three further areas — `config`, `qseow` and `qscloud` — are recognised but have no checks behind
them yet. They are added as real support cases show what is worth checking. Asking for one of them
today reports that nothing was checked, and **fails**; see *Areas with no checks yet* below.

**The verdict always states what it covered.** `doctor` will not say it found no problems "on this
machine" unless every area was examined — with three areas still empty, a normal run says
`found no problems in: browser, environment` and then names what it did not look at. That is
deliberate: a line reading `Result: OK` is read on its own, and pasted on its own, so it has to
carry its own limits rather than rely on you remembering which areas exist.

## A healthy server

```
info: App version: 4.1.0
info: Butler Sheet Icons doctor check (areas: browser, environment, config, qseow, qscloud)
info: Environment
info:     Platform            : win32 x64 (Puppeteer platform "win64")
info:     Running as user     : svc_butler
info:     Home directory      : C:\Users\svc_butler
info:     Working directory   : D:\butler-sheet-icons
info:     Standalone binary   : true
info: Browser executable
info:     Configured          : no
info: Browser cache
info:     Source              : default location
info:     Directory           : D:\butler-sheet-icons\browser-cache
info:     Directory exists    : yes
info:     In use              : yes
info:     Cached builds       : 1
info:         chrome 151.0.7922.138    platform=win64   executable present   usable
info: Selection
info:     Requested           : chrome 151.0.7922.138
info:     Would use           : cached browser (chrome 151.0.7922.138)
info:     Executable          : D:\butler-sheet-icons\browser-cache\chrome\win64-151.0.7922.138\chrome-win64\chrome.exe
info: Launch test
info:     Launched            : yes
info:     Reported version    : Chrome/151.0.7922.138
info: Note: these findings are best-effort. Butler Sheet Icons reports what it can observe on this
info: machine, and cannot see everything about your environment - group policy, antivirus, proxy rules
info: and Qlik Sense itself are all invisible to it. Review suggested commands before running them on a
info: production server.
info: Result: OK - Butler Sheet Icons found no problems in: browser, environment. Not examined: config, qseow, qscloud.
```

Reading it:

- **The last line names what was examined, and what was not.** It says `in: browser, environment`
  rather than "on this machine", because `config`, `qseow` and `qscloud` have no checks behind them
  yet. Once they do, the same run will read `found no problems on this machine.` Take the `Result:`
  line at its word: it claims exactly as much as was checked and no more.
- **The first line names the areas that were requested.** Together with the `Result:` line that is
  how you tell a full run from `--area environment` when you read the output again a week later.
- **The Environment block is the most valuable part on a Windows server**, even though it reports no
  problem. If a scheduled task runs as `LocalSystem`, `Running as user` says so, the home directory
  reads `C:\Windows\system32\config\systemprofile` and the working directory reads
  `C:\Windows\system32`. That turns "the browser cache is empty" — baffling on its own, because you
  staged a browser and can see it — into a one-glance diagnosis: the browser was staged into *your*
  profile, and the scheduled task is looking in a different one.
- **`Launch test` is the part that matters.** Finding a browser proves much less than starting it.
  A browser that is present but cannot run here fails at this step, not earlier.
- **The note before `Result:` is always printed** and cannot be turned off. Butler Sheet Icons is
  reasoning from what it can see on one machine. It cannot see group policy, antivirus rules, proxy
  configuration, or Qlik Sense itself. Read any suggested command before running it on production.

## A server that cannot work

```
info: App version: 4.1.0
info: Butler Sheet Icons doctor check (areas: browser, environment, config, qseow, qscloud)
info: Environment
info:     Platform            : win32 x64 (Puppeteer platform "win64")
info:     Running as user     : svc_butler
info:     Home directory      : C:\Users\svc_butler
info:     Working directory   : D:\butler-sheet-icons
info:     Standalone binary   : true
info: Browser executable
info:     Source              : from --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH
info:     Path                : D:\chrome\chrome.exe
info:     Exists              : no
error:     --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH is set to "D:\chrome\chrome.exe", and no such file exists on this machine. Butler Sheet Icons will not fall back to downloading a browser when an executable path has been given explicitly, so every thumbnail run will stop here.
info: Browser cache
info:     Source              : default location
info:     Directory           : D:\butler-sheet-icons\browser-cache
info:     Directory exists    : yes
info:     In use              : no (an executable path is configured but missing, so detection stops before the cache)
info:     Cached builds       : 1
info:         chrome 151.0.7922.138    platform=win64   executable present   usable
info: Selection
info:     Requested           : chrome recommended (build 151.0.7922.71)
info:     Would use           : nothing - detection could not complete
info: Note: these findings are best-effort. ...
error: Result: FAILED - the configured browser executable does not exist
error: Next steps:
error:     1. Correct the path so it names a browser that exists on this machine, or remove the setting to let Butler Sheet Icons find a browser itself. On Windows, Google Chrome is usually at C:\Program Files\Google\Chrome\Application\chrome.exe and Microsoft Edge at C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe.
```

Reading it:

- **`Result: FAILED` names the specific problem**, not a generic sentence. "the configured browser
  executable does not exist" and "no usable browser was found" send you to completely different
  places.
- **`Next steps` is numbered and in order.** Do them from the top.
- **Facts that are fine are still printed.** The cache here holds a perfectly good browser, and
  saying so is what tells you the cache is not the problem — the explicitly configured executable
  path is. `In use : no (...)` explains why that good browser will never be used.

## The exit code

`doctor check` exits `0` when nothing failed and `1` when something did, so it can gate a
deployment script:

```
butler-sheet-icons doctor check
if %errorlevel% neq 0 (
    echo Butler Sheet Icons is not ready on this server
    exit /b 1
)
```

Warnings do not fail the run. A warning is something worth knowing that did not stop this machine
from working.

## Checking one area only

`--area` narrows the run. Give it more than once, or as a comma-separated list:

```
butler-sheet-icons doctor check --area environment
butler-sheet-icons doctor check --area environment --area browser
```

The most useful narrow run is `--area environment`. It answers "which account is this actually
running as, and where is it looking?" in under a second, and it does **not** start a browser — worth
knowing if you are running it repeatedly, or on a server where starting a browser is awkward.

```
info: Butler Sheet Icons doctor check (areas: environment)
info: Environment
info:     Platform            : win32 x64 (Puppeteer platform "win64")
info:     Running as user     : svc_butler
info:     Home directory      : C:\Users\svc_butler
info:     Working directory   : D:\butler-sheet-icons
info:     Standalone binary   : true
info: Note: these findings are best-effort. ...
info: Result: OK - Butler Sheet Icons found no problems in: environment.
```

Note the last line. It does not claim the server is fine — only that the one area asked about is.

### Areas with no checks yet

`config`, `qseow` and `qscloud` are accepted as area names but have nothing behind them yet:

```
butler-sheet-icons doctor check --area qseow
```

```
info: Butler Sheet Icons doctor check (areas: qseow)
info: Coverage
error:     Nothing was examined for: qseow (Butler Sheet Icons has no checks for this area yet). Nothing about this machine was examined, so this report says nothing about whether it works.
...
error: Result: FAILED - No diagnostic checks were run
```

This **fails**, with exit code 1, and that is on purpose. If it exited 0 instead, a deployment
script gating on `doctor check --area qseow` would report a healthy server having verified nothing
at all. A run that checked nothing must never look like a run that passed.

Naming an empty area **alongside** a real one fails for the same reason:

```
butler-sheet-icons doctor check --area environment --area qseow
```

```
error:     Nothing was examined for: qseow (Butler Sheet Icons has no checks for this area yet). This report covers environment only, and says nothing about the rest.
error: Result: FAILED - Some areas were not examined
```

You asked for `qseow` and Butler Sheet Icons cannot answer, so it says so rather than passing on
the strength of the areas it *could* check.

The default run is treated differently, and deliberately: running `doctor check` with no `--area`
is not a request for any particular area, it means "check everything you can". Areas with nothing
behind them are simply left out of the answer and named in the `Result:` line, and the run does not
fail.

There is a third case, which you will meet once network checks arrive: an area whose checks all
need network access you did not grant. Nothing ran there either, so it is reported the same way
rather than counted as passing.

## Machine-readable output

`--outputformat json` prints the whole report as a JSON document instead of the human report:

```
butler-sheet-icons doctor check --outputformat json > doctor-report.json
```

Two things it is for:

1. **Scripting.** `ok` is the same verdict as the exit code, and each finding carries a stable id.
2. **Support.** If you open a Butler Sheet Icons issue on GitHub, attaching this document gives a
   complete picture of a server nobody else can log in to. It is the single most useful thing you
   can include.

The document looks like this (abridged):

```json
{
  "schemaVersion": 1,
  "tool": "butler-sheet-icons",
  "toolVersion": "4.1.0",
  "command": "doctor check",
  "generatedAt": "2026-08-15T19:30:02.417Z",
  "areas": ["environment"],
  "examined": ["environment"],
  "allowNetwork": false,
  "disclaimer": "Note: these findings are best-effort. ...",
  "ok": true,
  "checks": [
    {
      "id": "environment",
      "title": "This machine, and the account Butler Sheet Icons is running as",
      "section": "Environment",
      "area": "environment",
      "skipped": null
    }
  ],
  "findings": [
    {
      "id": "BSI-ENV-001",
      "severity": "info",
      "confidence": "confirmed",
      "check": "environment",
      "area": "environment",
      "title": "Machine and account details",
      "detail": "Running on win32 x64 (Puppeteer platform \"win64\") as user \"svc_butler\", ...",
      "facts": [{ "label": "Running as user", "value": "svc_butler", "sublines": [] }],
      "evidence": { "user": "svc_butler", "isSea": true },
      "remediation": [],
      "docs": null,
      "supersededBy": [],
      "supersededByFinding": null
    }
  ]
}
```

Worth knowing about the fields:

- **`areas` is what you asked for; `examined` is what was actually looked at.** They differ when an
  area has no checks yet, or when every check it does have was skipped. **`ok` is a statement about
  `examined`, never about `areas`** — a script that reads `ok` without reading `examined` can draw
  exactly the false conclusion this command exists to prevent.
- **`severity`** is `error`, `warning`, `info` or `ok`. Only `error` fails the run.
- **`confidence`** is `confirmed` for everything this command produces: a check looked, and this is
  what it found on your machine. The field exists so that future features which infer a likely cause
  from a symptom can be told apart from something actually observed.
- **`id`** is permanent. `BSI-ENV-001` will always mean the same thing, so it is safe to search for
  and safe to quote in an issue.
- **`disclaimer`** is carried inside the document as well as printed, so it travels with the report
  if anything reformats it.

### The JSON is redacted before it is written

Because this document is designed to be shared, every part of it — the details, the facts, the
evidence and the suggested commands — is passed through Butler Sheet Icons' secret redaction before
anything is written. Passwords, API keys, bearer tokens and credentials embedded in URLs are
replaced with `[REDACTED]`:

```json
"detail": "--browser-executable-path is set to \"D:\\chrome?apikey=[REDACTED]\", and no such file exists ..."
```

Redaction is best-effort, as it is everywhere else in Butler Sheet Icons. It covers the shapes
Qlik Sense and Qlik Cloud configurations actually take, but **give the document a read before you
attach it to a public issue** — that is good practice for any diagnostic output, from any tool.

When `--outputformat json` is used, the JSON document is the only thing written to standard output,
so it can be piped straight into another program:

```
butler-sheet-icons doctor check --outputformat json | jq .ok
```

Log lines go to **standard error** in this mode, so they cannot land in the middle of the document
and stop it parsing. That is worth knowing if something goes wrong: a run that produces an empty or
unexpected document usually has the reason waiting on standard error, which a pipe like the one
above discards. Capture both when investigating:

```
butler-sheet-icons doctor check --outputformat json > report.json 2> report.log
```

This applies to `--outputformat json` only. Every other Butler Sheet Icons command, including
`doctor check` without the flag, writes its whole log to standard output as it always has, so
existing scripts that capture output with `> bsi.log` are unaffected.

## Checks that need the network

`--allow-network` permits checks that reach out over the network to run. It is off by default, and
the default is the one to keep on an air-gapped server: a check that tries to resolve a hostname
with no route out does not fail quickly, it hangs. Checks that need the network are skipped instead,
and the report says so.

No check ships with this requirement today. The option exists because the checks that will need it —
reaching a Qlik Sense host, for instance — are the ones being added next.

## Options

<!-- Generated. Refresh with: npm run docs:cli-tables -- <page> --write. Never hand-edit. -->

<!-- generated:cli-options doctor check -->

| Option                             | Environment Variable           | Description                                                                                                                                                                                                                                                                                                                                                                         | Default       | Example               |
| ---------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------- |
| `--log-level, --loglevel <level>`  | `BSI_DOCTOR_C_LOG_LEVEL`       | Log level (choices: error, warn, info, verbose, debug, silly)                                                                                                                                                                                                                                                                                                                       | `info`        | `--loglevel error`    |
| `--area <area...>`                 | `BSI_DOCTOR_C_AREA`            | Limit the run to these areas. Defaults to every area. Areas with no checks behind them yet fail the run rather than reporting a clean bill of health. (choices: browser, environment, config, qseow, qscloud)                                                                                                                                                                       | -             | `--area browser`      |
| `--outputformat <text\|json>`      | `BSI_DOCTOR_C_OUTPUTFORMAT`    | Output format (choices: text, json)                                                                                                                                                                                                                                                                                                                                                 | `text`        | `--outputformat json` |
| `--allow-network [true\|false]`    | `BSI_DOCTOR_C_ALLOW_NETWORK`   | Allow checks that need network access to run. Off by default: the checks that need it are skipped rather than left to time out on a server with no internet access.                                                                                                                                                                                                                 | `false`       | -                     |
| `--browser <browser>`              | `BSI_DOCTOR_C_BROWSER`         | Browser to check for. Only "chrome" is supported. (choices: chrome)                                                                                                                                                                                                                                                                                                                 | `chrome`      | `--browser chrome`    |
| `--browser-version <version>`      | `BSI_DOCTOR_C_BROWSER_VERSION` | Browser build to check for. Either a keyword - "recommended" for the build Butler Sheet Icons is tested with, "stable" for the newest stable release, or a release channel such as "beta" - or an exact version: a milestone ("151"), a build prefix ("151.0.7922") or a full build id ("151.0.7922.77"). Use "butler-sheet-icons browser list-available" to see what is available. | `recommended` | -                     |
| `--browser-cache-dir <directory>`  | `BSI_BROWSER_CACHE_DIR`        | Directory where Butler Sheet Icons keeps downloaded browsers. Defaults to a "browser-cache" folder next to the Butler Sheet Icons executable for standalone builds, and to the .cache/puppeteer folder in the current user's home directory otherwise.                                                                                                                              | -             | -                     |
| `--browser-executable-path <path>` | `BSI_BROWSER_EXECUTABLE_PATH`  | Full path to a browser executable to use, for example a Microsoft Edge or Google Chrome already installed on this machine. Butler Sheet Icons then neither downloads nor manages a browser. Takes precedence over PUPPETEER_EXECUTABLE_PATH. If the file does not exist the run stops rather than downloading a browser instead.                                                    | -             | -                     |
| `--headless <true\|false>`         | `BSI_DOCTOR_C_HEADLESS`        | Headless (=not visible) browser (true, false)                                                                                                                                                                                                                                                                                                                                       | `true`        | -                     |
| `--skip-launch [true\|false]`      | `BSI_DOCTOR_C_SKIP_LAUNCH`     | Find a browser but do not start it. Faster, and useful where starting a browser is not allowed - but it leaves the most valuable part of the check undone.                                                                                                                                                                                                                          | `false`       | -                     |
| `-h, --help`                       | -                              | display help for command                                                                                                                                                                                                                                                                                                                                                            | -             | `-h`                  |

<!-- /generated:cli-options -->

Two of these are shared with the other browser commands rather than being specific to `doctor`:
`--browser-cache-dir` (`BSI_BROWSER_CACHE_DIR`) and `--browser-executable-path`
(`BSI_BROWSER_EXECUTABLE_PATH`). That is deliberate — where the browser lives is a property of the
server, not of one command, so the same setting applies to every command that needs it.

One consequence worth stating plainly, because the other four variables in the table do follow the
`BSI_DOCTOR_C_` pattern: **there is no `BSI_DOCTOR_C_BROWSER_CACHE_DIR` and no
`BSI_DOCTOR_C_BROWSER_EXECUTABLE_PATH`.** Setting either does nothing. Use the shared names from
the table — that is also what guarantees the doctor reads the same cache your real runs read,
which is the whole point of running it.

The browser options are worth passing when your real runs pass them. A diagnostic that reports OK
under different settings than the run it is meant to predict is worse than no diagnostic, so give
`doctor check` the same `--browser-cache-dir`, `--browser-version` and `--headless` your scheduled
run uses.

## When to run it

- **Before the first thumbnail run on a new server**, as an acceptance check.
- **After changing the account** a scheduled task runs as. This is the single most common cause of a
  run that worked yesterday and does not today, and the Environment block finds it immediately.
- **After staging or upgrading a browser** on a server with no internet access.
- **Whenever a run fails and you do not know why** — and attach `--outputformat json` output to the
  issue if you end up opening one.

---

## Suggested addition to the existing `browser check` page

At the top of that page, after the introduction:

> If you already know the problem is the browser, `browser check` is the command to run. If a Butler
> Sheet Icons run has failed and you do not yet know why, run [`doctor`](../troubleshooting/doctor.md)
> instead — it runs every check Butler Sheet Icons has, including all of the ones on this page.
