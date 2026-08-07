# Air-gapped browser support, phase 1: make the browser findable

Design document for the first phase of [issue #809](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/809).
Not yet implemented.

**Phase 1 in one sentence:** Butler Sheet Icons (BSI) can already run without internet access if it
finds a browser — so let administrators tell it where the browser is, and make it honest about what
it finds.

---

## 1. The problem

Some client-managed Qlik Sense Enterprise on Windows (QSEoW) environments have no internet access,
particularly in corporate and government deployments. BSI needs a Chromium-family browser to
screenshot sheets. Today the only browser it can obtain is one it downloads itself, which is exactly
what an air-gapped network prevents.

The research on #809 established something important: **this is not an architectural problem.** A
`qseow create-sheet-thumbnails` run that *finds* a browser makes zero outbound internet calls —
detection returns, `puppeteer.launch()` speaks CDP over localhost, and QRS, the engine and the content
library are all on the Sense server. The only external hosts BSI ever contacts
(`versionhistory.googleapis.com`, `googlechromelabs.github.io`, `storage.googleapis.com`) are reached
only from the browser *install* path.

So air-gapped operation reduces to two problems:

- **(A)** getting browser bits onto the machine, and
- **(B)** telling BSI where they are.

Phase 1 solves (B) completely, and makes (A) trustworthy by fixing detection so that a badly staged
browser is diagnosed instead of silently accepted. Phase 2 — a matched pair of commands for preparing
a browser bundle on a connected machine and installing it on an air-gapped one — is out of scope here
and is described in the #809 comment.

### 1.1 Evidence

Every claim below was verified, not inferred. Reproduce any of them before changing the relevant code.

| # | Finding | How it was verified |
| --- | --- | --- |
| 1 | `PUPPETEER_EXECUTABLE_PATH` is the **only** way to point BSI at a browser. No CLI flag, no `BSI_*` variable. | `src/lib/browser/browser-detect.js:24` is the sole read; no matching option exists in `src/lib/commands/`. |
| 2 | The cache directory `path.join(homedir(), '.cache/puppeteer')` is hardcoded at **8 call sites** in 6 files, with no override. | Listed in §10. |
| 3 | `@puppeteer/browsers` 3.0.5 reads **no** environment variable for `cacheDir` or `baseUrl`, so `PUPPETEER_CACHE_DIR` does nothing in BSI today. | `grep 'process.env'` across the package returns only `SystemRoot`, `LOCALAPPDATA`, `CHROME_CONFIG_HOME`, `XDG_CONFIG_HOME`. |
| 4 | `getInstalledBrowsers()` does **not** filter by platform, and `detectAvailableBrowser()` does not either, nor does it check that the executable exists. | Executed on macOS against a cache containing `chrome/win64-131.0.6778.204/`: returned `platform=win64` with a `chrome.exe` path. `Cache.js` `getInstalledBrowsers()` / `parseFolderPath()` confirm no platform check. |
| 5 | `browser install` fails offline **even when the build is already cached**, because `canDownload()` runs first and issues a network request. | Executed with the download host pointed at `http://127.0.0.1:9/blocked` and an archive pre-staged in the cache: `install()` **succeeded with no network**; `canDownload()` returned `false` for the same inputs. |
| 6 | `uninstall()` defaults `platform` to the **host** platform, so removing a foreign-platform build deletes nothing while BSI logs success. | `@puppeteer/browsers/lib/install.js` — `uninstall()` does `options.platform ??= detectBrowserPlatform()`; BSI never passes `platform`. |
| 7 | `canDownload()` ignores `cacheDir` entirely. | `install.js:293-319` builds a URL from `{browser, platform, buildId}` and issues a HEAD request. `cacheDir` is never read. |
| 8 | `detectBrowserPlatform()` is **synchronous** and returns `undefined` on any platform that is not darwin, linux or win32. | `@puppeteer/browsers/lib/detectPlatform.js`. |

Finding 4 matters more than it looks. The workflow the doc site currently recommends for air-gapped
setups is "archive `~/.cache/puppeteer` on a connected machine and copy it across". If the connected
machine is the administrator's Mac and the target is a Windows Sense server — the overwhelmingly
likely combination — BSI accepts the useless cache, logs `Using cached browser: chrome 131.0.6778.204`,
and then fails at launch with an error that says nothing about the real cause.

Note also that [PR #832](https://github.com/ptarmiganlabs/butler-sheet-icons/pull/832) recently fixed a
missing `await` that made cached-browser detection *always* return `null`. Before that fix, pre-caching
a browser genuinely did not work at all. That is probably why air-gapped runs have been reported as
broken. It is fixed but, at the time of writing, unreleased.

---

## 2. Scope

**In scope**

1. A single module that resolves the browser cache directory and any browser-executable override.
2. `--browser-cache-dir` / `BSI_BROWSER_CACHE_DIR`, plus honouring `PUPPETEER_CACHE_DIR`, and a new
   default location for standalone binaries.
3. `--browser-executable-path` / `BSI_BROWSER_EXECUTABLE_PATH`.
4. Detection that filters by platform, verifies the executable exists, and explains itself when it
   finds nothing usable.
5. A `browser check` command that reports what BSI would do, and proves it by launching the browser.
6. `browser install` succeeding offline when the requested build is already staged.
7. Two latent bugs that become user-visible as a direct result of the above (§8).
8. The **check contract and registry** from §15.3–§15.4, with `browser check` built on it. Only the
   contract itself is phase-1 work; it is here because retrofitting it onto a shipped `browser check`
   is the expensive path.

**Explicitly out of scope**

- Bundling a browser into the BSI release ZIP. Chrome for Testing is *Chrome*, not Chromium, and no
  redistribution right is granted for the binaries; the archives also add 147–158 MB per platform.
  See the #809 comment for the full analysis.
- Preparing and transferring browser bundles (`browser prepare-offline` / `browser install --from`).
  That is phase 2.
- An internal download mirror (`--browser-download-base-url`). Phase 3, demand-driven.
- Auto-detecting system-installed Chrome or Edge. Phase 3.
- The `doctor` command itself — `doctor check`, `doctor analyze`, `doctor explain`. Designed in §15
  so that phase 1 builds towards it, but only the contract it rests on is built now.

---

## 3. Design: one place that resolves paths

New file `src/lib/browser/browser-paths.js`. It owns every decision about *where* browser files live,
so that the answer cannot drift between the command that writes a browser and the command that reads
it.

```js
getDefaultBrowserCacheDir()            // -> string
describeBrowserCacheDir(options)       // -> { cacheDir, source, legacyCacheDir }
resolveBrowserCacheDir(options)        // -> string (logs at debug, delegates to describe…)
resolveExecutablePathOverride(options) // -> { path, source, explicit } | null
SOURCE_LABELS                          // -> human-readable text per source value
```

`SOURCE_LABELS` gives each `source` a phrase suitable for a log line or the `browser check` report:

| `source` | Label |
| --- | --- |
| `option` | `--browser-cache-dir / BSI_BROWSER_CACHE_DIR` (or the executable-path pair) |
| `puppeteer-env` | `PUPPETEER_CACHE_DIR` (or `PUPPETEER_EXECUTABLE_PATH`) |
| `standalone` | `default location next to the Butler Sheet Icons executable` |
| `default` | `default location` |

Do **not** try to distinguish "came from the CLI flag" from "came from the `BSI_*` variable".
Commander can tell you via `cmd.getOptionValueSource()`, but the worker functions do not reliably
receive the `Command` object — `commands.test.js` passes `{}`, and the integration tests call workers
directly. One combined label is honest and costs nothing.

### 3.1 Resolve lazily at each call site

Resolution happens inside each worker, at the point of use, not once at the command layer with the
result written onto `options`.

The reason is not style. Several integration tests call workers directly with a bare object — for
example `browserInstalled({})` in `browser_edge_cases.integration.test.js`. With eager resolution
`cacheDir` would be `undefined`, and `new Cache(undefined)` throws on the first `path.join`. Lazy
resolution keeps every worker independently callable, which is exactly how those tests use them. It
also touches zero command handlers, and it is idempotent, so nothing depends on who resolved first.

The `const resolvedOptions = { ...options }` shallow copy in both `create-sheet-thumbnails` handlers is
not an obstacle either way — the values are strings — but with lazy resolution it is simply irrelevant.

### 3.2 Empty means unset, and these options take no `argParser`

Every tier trims its candidate and treats `''` or whitespace as absent. Three independent reasons:

- Commander's env handling tests `option.envVar in process.env`, so `BSI_BROWSER_CACHE_DIR=""` yields
  `options.browserCacheDir === ''`, not `undefined`.
- `PUPPETEER_EXECUTABLE_PATH=""` meaning "ignore this" is **already a documented BSI idiom** —
  `docs/browser-detection-environment-variables.md` tells Docker users to pass
  `-e PUPPETEER_EXECUTABLE_PATH=""` to fall through to a mounted cache. Breaking it is a regression.
- Commander runs `parseArg` on values sourced from the environment too. An `argParser` that rejected
  the empty string would therefore turn `BSI_BROWSER_CACHE_DIR=""` into a hard CLI error rather than
  a no-op.

So: **no path validator in `src/lib/commands/helpers.js`**, and trim-and-ignore inside the resolver.

Apply `path.resolve()` to a configured value so a relative path is logged as the absolute path BSI
actually used — under a scheduled task the working directory is rarely what the administrator expects.
Do not expand `~`; Node does not, and doing so would surprise.

---

## 4. Where the browser cache lives

### 4.1 Precedence

```
1. --browser-cache-dir / BSI_BROWSER_CACHE_DIR
2. PUPPETEER_CACHE_DIR
3. Standalone (SEA) builds only:  <directory containing butler-sheet-icons(.exe)>/browser-cache
4. path.join(homedir(), '.cache', 'puppeteer')
```

**Tier 3 is a deliberate change of default for standalone binaries**, and it is the answer to the
sharpest operational trap in this whole area. On a QSEoW server BSI runs from a scheduled task or an
external-program task, under a service account — often LocalSystem, whose `homedir()` is
`C:\Windows\system32\config\systemprofile`. An administrator who stages a browser while logged in as
themselves puts it somewhere BSI will never look. Keeping the cache beside the executable makes it
follow the deployment rather than whichever account happens to run it.

Gate tier 3 strictly on `isSea` from `src/globals.js`. Do **not** reuse `bsiExecutablePath` for this:
it is `path.dirname(process.execPath)` under SEA but falls back to `process.cwd()` otherwise
(`globals.js:274`), and cwd must never become a cache location. The Docker image runs plain Node, so
`isSea` is false there and Docker behaviour is unchanged.

Use `path.join(homedir(), '.cache', 'puppeteer')` for tier 4 — byte-identical to today's
`path.join(homedir(), '.cache/puppeteer')` on both POSIX and Windows, because `path.join` normalises
separators. That equivalence is what makes the first commit a provable no-op for non-standalone users,
so assert it in a test rather than trusting it. This repo has already been bitten once by a separator
assumption (issue #855).

### 4.2 The legacy-cache fallback

Moving the default would otherwise mean every existing standalone user silently re-downloads ~150 MB
once — precisely the failure this project exists to prevent, and catastrophic for anyone who has
already gone offline.

So: when the resolved directory is **tier 3** and it contains no browsers, but the legacy
`~/.cache/puppeteer` does, read from the legacy location and log exactly one `info` line:

```
No browsers found in C:\butler-sheet-icons\browser-cache, but 1 was found in the previous default
location C:\Users\svc_qlik\.cache\puppeteer. Using the previous location for now.
Move that directory next to butler-sheet-icons.exe, or set --browser-cache-dir, to keep using it.
```

Two constraints on this fallback:

- It is **read-only**. Installs always write to the resolved primary. Say so in the code comment — an
  asymmetry that is not documented will be "tidied up" by a later contributor.
- It applies **only** to tier 3. If the administrator named a directory explicitly, or set
  `PUPPETEER_CACHE_DIR`, they meant it, and quietly reading somewhere else would be worse than
  finding nothing.

### 4.3 Writability

A binary unzipped under `C:\Program Files\` yields an unwritable tier-3 directory. `browser install`
must fail with a message that names the fix rather than surfacing a raw `EACCES`:

```
Cannot write to the browser cache directory C:\Program Files\butler-sheet-icons\browser-cache.
Choose a writable location with --browser-cache-dir or BSI_BROWSER_CACHE_DIR, or run Butler Sheet
Icons from a directory you can write to.
```

### 4.4 `PUPPETEER_CACHE_DIR` cannot go through Commander

It has to be read in code, and this is not a shortcut — Commander genuinely cannot express it:

1. `Option.env(name)` stores a single `envVar`. Two names for one option is not representable.
2. Commander has one env precedence level; there is no way to say "`BSI_` beats `PUPPETEER_`".
3. A `.default()` on the option would make `options.browserCacheDir` always truthy, so the fallback
   would be unreachable.

Read `process.env.PUPPETEER_CACHE_DIR` in exactly one place, `describeBrowserCacheDir()`, with a
comment carrying that justification. `AGENTS.md` says to avoid hardcoded env reads; the rule's intent
is "don't scatter `process.env` through business logic", and one read in one dedicated module honours
it. There is precedent in `browser-detect.js:24` and `globals.js:170`.

**Log at `info` whenever a non-default source wins.** Anyone who already has `PUPPETEER_CACHE_DIR` set
currently has BSI ignoring it, and after this change BSI will look somewhere else and appear to have
lost its browsers. The `info` line is what makes that diagnosable from a log an administrator sends in.

---

## 5. The two new options

| Option | Env var | Commands |
| --- | --- | --- |
| `--browser-cache-dir <directory>` | `BSI_BROWSER_CACHE_DIR` | `browser install`, `browser list-installed`, `browser uninstall`, `browser uninstall-all`, `browser check`, `qseow create-sheet-thumbnails`, `qscloud create-sheet-thumbnails` |
| `--browser-executable-path <path>` | `BSI_BROWSER_EXECUTABLE_PATH` | `qseow create-sheet-thumbnails`, `qscloud create-sheet-thumbnails`, `browser check` |

Neither option gets a `.default()` — the defaults live in the resolver, and a Commander default would
mask the `PUPPETEER_CACHE_DIR` tier (§4.4).

**Not `browser list-available`.** Both `browserPath` values in `browser-list-available.js` (lines 169
and 319) are passed to `canDownload()`, which ignores `cacheDir` entirely (finding 7). They are dead
values. Switch them to the resolver for consistency, but do **not** advertise an option there — it
would be a knob that provably does nothing.

**Both env vars are shared across commands rather than per-command prefixed.** The existing convention
is per-command (`BSI_QSEOW_CST_*`, `BSI_BROWSER_I_*`, …), but the browser location is a property of the
*machine*, not of one command: the same value must be honoured by `browser install` when it writes and
by `create-sheet-thumbnails` when it reads. Seven prefixed names for one machine fact would be worse
than the `PUPPETEER_CACHE_DIR` this is meant to supersede. `BSI_BROWSER_PAGE_TIMEOUT`, already shared
by both thumbnail commands, is the precedent.

Do not copy the `BS_BROWSER_UIA_LOG_LEVEL` typo in `uninstall-all.js:47` — it is the only environment
variable in the repo not starting with `BSI_`, and it is a mistake, not a convention.

### 5.1 Executable-path precedence

```
1. --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH   -> explicit: true
2. PUPPETEER_EXECUTABLE_PATH                                  -> explicit: false
3. null
```

The `explicit` flag is load-bearing, and §6.1 explains why.

Note that `BSI_BROWSER_EXECUTABLE_PATH` outranking `PUPPETEER_EXECUTABLE_PATH` means it also outranks
the value the Docker image sets. That is intended — it is how a container user overrides the embedded
Chromium — but it must be documented.

---

## 6. Honest detection

All changes are in `src/lib/browser/browser-detect.js`. The function's contract is unchanged in one
respect and extended in exactly one other: **`null` still means "caller may download"**, and there is
now exactly one way for it to throw.

Its JSDoc (lines 8–19) documents the old priority order verbatim and must be rewritten. So must the
"Browser Detection Algorithm" pseudo-code block near the end of
`docs/browser-detection-environment-variables.md`, which will otherwise actively mislead.

### 6.1 Priority 1: the executable override

Replace the inline `process.env.PUPPETEER_EXECUTABLE_PATH` read with
`resolveExecutablePathOverride(options)`. Three cases:

- **File exists** → return the same object shape as today: `{ executablePath, source: 'system',
  browser: options.browser, buildId: 'system-installed' }`.
- **File missing, `explicit === false`** → **unchanged**: warn, fall through to the cache. This is
  legacy `PUPPETEER_EXECUTABLE_PATH` behaviour and the Docker documentation depends on it. Do not
  touch it.
- **File missing, `explicit === true`** → log the error below, call `markReported(err)`, and **throw**.

The asymmetry is deliberate. An administrator who names a path with a BSI option has stated an
intent; silently downloading a different browser instead is a compliance problem in a regulated Qlik
estate, and on an air-gapped machine it is a guaranteed failure with a misleading error. A stale
inherited environment variable is a much weaker signal, and thousands of existing setups rely on the
fall-through.

Add `BrowserNotFoundError` to `src/lib/util/errors.js`. The existing outer `catch` in
`detectAvailableBrowser` swallows everything and returns `null`, so it must re-throw BSI-typed errors
before that `return`.

**Knock-on:** `launchBrowserForApp` (`browser-launch.js:151-155`) relabels anything thrown by
`resolveBrowserExecutablePath` as `Failed to install a browser for <app>`, which is simply wrong when
nothing tried to install. Change the message to `Could not obtain a browser for <app>` — accurate in
both cases — and update the assertion in `browser_launch.test.js`. This is cheaper and less fragile
than an `instanceof` guard at the wrap site.

### 6.2 Priority 2: the cache funnel

```js
const all        = await getInstalledBrowsers({ cacheDir });
const ofType     = all.filter((b) => b.browser === options.browser);
const hostPlat   = detectBrowserPlatform();               // sync; undefined off darwin/linux/win32
const ofPlatform = hostPlat ? ofType.filter((b) => b.platform === hostPlat) : ofType;
const usable     = ofPlatform.filter((b) => fs.existsSync(b.executablePath));
const matching   = pinned ? usable.filter((b) => b.buildId === options.browserVersion) : usable;
```

Two ordering details that need a comment in the code so they survive future edits:

- **`getInstalledBrowsers()` must be called before `detectBrowserPlatform()`.** Inverting them makes
  the existing "cache lookup rejects" test fail for the wrong reason.
- **`hostPlat === undefined` disables platform filtering** rather than filtering everything out
  (finding 8). A platform BSI does not recognise works today and must keep working.

Report from the **last non-empty stage**, so the message always describes the real obstacle:

| Stage that emptied | Level | Message |
| --- | --- | --- |
| `all` | debug | `No cached browsers found` (unchanged) |
| `ofType` | debug | existing "no cached browsers matching type" line (unchanged) |
| `ofPlatform` | warn | platform mismatch, §6.3 |
| `usable` | warn | executable missing, §6.3 |
| `matching` | warn | pinned-version miss, §6.3 |

Individual skipped entries log at `verbose`; the `warn` blocks fire only when the funnel empties. A
healthy run with one stale directory in the cache therefore stays quiet. State that rule in a comment.

### 6.3 Message text

Exact wording matters more than usual here: these strings are what administrators paste into a search
box, and the troubleshooting documentation (§9) quotes them verbatim.

**Explicit executable path missing** — `logger.error`, then throw:

```
--browser-executable-path is set to "D:\browsers\chrome.exe" but no such file exists on this machine.
Butler Sheet Icons will not fall back to downloading a browser when an executable path has been given
explicitly. Correct the path, or remove the option to let Butler Sheet Icons find a browser itself.
```

**Platform mismatch** — `logger.warn`, three lines. The highest-value message in this change:

```
Found 2 cached chrome build(s), but none built for this machine (platform "win64").
Cached chrome builds are for: mac_arm. A browser cache copied from a machine with a different
operating system cannot be used.
Browser cache directory: C:\butler-sheet-icons\browser-cache
```

**Cached, but the executable is missing** — `logger.warn`, two lines, plus one `verbose` per entry:

```
Found 1 cached chrome build(s) for this machine, but none has a usable executable. The cache
directory may be incomplete - for example copied without the browser binary, or left behind by a
failed install.
Browser cache directory: C:\Windows\system32\config\systemprofile\.cache\puppeteer
```

```
Skipping cached chrome 138.0.7204.94: executable not found at <path>
```

**Pinned version missed, but a usable build is cached** — `logger.warn`, three lines:

```
No cached chrome build matches --browser-version "121.0.6167.85".
Cached chrome builds that this machine can run: 138.0.7204.94. Use --browser-version latest to
accept any of them.
Butler Sheet Icons will now try to download chrome "121.0.6167.85", which needs internet access. On
a machine without internet access this will fail.
```

`warn`, not `error`: on a connected machine the run still succeeds. Do not promise a `--no-download`
behaviour in this text — that is phase 2.

A cache copied without its `.metadata` file — which is what a `tar` invocation that skips dotfiles
produces — lands in the "executable missing" case, because `computeExecutablePath` falls back to the
default layout. That is a second, independent justification for the existence check.

---

## 7. The `browser check` command

The doctor. It answers "will a real run work on this machine?" without touching Qlik Sense, so it is
safe to hand to a customer as the first troubleshooting step, and safe to script into a deployment
check.

> **Build this on the check contract in §15.3, not as a standalone command.** Everything specified
> below — the options, the output, the exit codes — stays exactly as written; what changes is that
> the facts come from registered checks and the formatting from a shared renderer. That costs
> roughly a third more than a bespoke implementation and is the difference between the *second*
> diagnostic being nearly free and requiring a rewrite of a command users already depend on. §15.1
> explains the reasoning.

**Files**

- `src/lib/commands/browser/check.js` — `buildBrowserCheckCommand()` and `handleBrowserCheck()`,
  shaped like `list-installed.js`.
- `src/lib/browser/browser-check.js` — `browserCheck(options)`, returning structured data.
- Register in `src/lib/commands/browser/index.js`.

The worker returns data rather than only logging, so tests assert on values instead of log strings:

```js
{
  ok, hostPlatform, nodePlatform, arch, user, homeDir, cwd, isSea,
  executableOverride: { path, source, exists } | null,
  cacheDir, cacheDirSource, cacheDirExists, cacheDirUsed, legacyCacheDirInUse,
  cachedBrowsers: [{ browser, buildId, platform, executablePath, executableExists, usable, reason }],
  selection: { source, executablePath, browser, buildId } | null,
  wouldDownload, launched, browserVersion, launchError
}
```

**Options**

| Option | Env var | Default |
| --- | --- | --- |
| `--loglevel, --log-level <level>` | `BSI_BROWSER_C_LOG_LEVEL` | `info` |
| `--browser <browser>` (`chrome`, `firefox`) | `BSI_BROWSER_C_BROWSER` | `chrome` |
| `--browser-version <version>` | `BSI_BROWSER_C_BROWSER_VERSION` | `latest` |
| `--browser-cache-dir <directory>` | `BSI_BROWSER_CACHE_DIR` | — (resolver decides) |
| `--browser-executable-path <path>` | `BSI_BROWSER_EXECUTABLE_PATH` | — |
| `--headless <true\|false>` | `BSI_BROWSER_C_HEADLESS` | `true` |
| `--skip-launch` | `BSI_BROWSER_C_SKIP_LAUNCH` | `false` |

`--headless` earns its place: a headed launch on a display-less server is a genuinely different test
from a headless one. Reuse the `'' -> 'latest'` normalisation the thumbnail handlers apply to
`--browser-version`, so the doctor cannot report OK under different pin semantics than the real run.

### 7.1 It must not touch the network

**Call `detectAvailableBrowser(options)` directly. Never `resolveBrowserExecutablePath()`.** The
latter falls through to `browserInstall()` → `canDownload()` → a network HEAD request (finding 5). A
doctor that hangs on a DNS timeout on an air-gapped server is worse than no doctor at all. When
detection returns `null`, set `wouldDownload: true` and stop.

### 7.2 It does launch

That is the point — resolving a path proves far less than starting the process. Use the production
`buildBrowserArgs()` and `parseHeadlessOption()` so the test matches reality, call `browser.version()`,
and close in a `finally` (`AGENTS.md` warns specifically about unclosed browsers hanging tests). No
`newPage()`, no navigation, no Qlik contact.

### 7.3 Output

Follow the repo's 4-space `Key : value` style (`cloud-test-connection.js`, `browser-installed.js:41`):

```
info: Butler Sheet Icons browser check
info: Environment
info:     Platform            : win32 x64 (Puppeteer platform "win64")
info:     Running as user     : svc_qlik
info:     Home directory      : C:\Windows\system32\config\systemprofile
info:     Working directory   : C:\Windows\system32
info:     Standalone binary   : true
info: Browser executable
info:     Source              : --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH
info:     Path                : C:\Program Files\Google\Chrome\Application\chrome.exe
info:     Exists              : yes
info: Browser cache
info:     Source              : default location next to the Butler Sheet Icons executable
info:     Directory           : C:\butler-sheet-icons\browser-cache
info:     Directory exists    : yes
info:     In use              : no (an executable path is configured, so the cache is not consulted)
info:     Cached builds       : 2
info:         chrome 138.0.7204.94   platform=win64   executable present   usable
info:         chrome 131.0.6778.204  platform=mac_arm executable present   not usable (built for another platform)
info: Selection
info:     Requested           : chrome latest
info:     Would use           : system browser
info:     Executable          : C:\Program Files\Google\Chrome\Application\chrome.exe
info: Launch test
info:     Launched            : yes
info:     Reported version    : Chrome/138.0.7204.94
info: Result: OK - Butler Sheet Icons can take screenshots on this machine without internet access.
```

`Running as user`, `Home directory` and `Working directory` are there deliberately: they turn the
LocalSystem trap into a one-glance diagnosis, and the working directory matters because `globals.js`
loads `dotenv/config`, so a `.env` file may never be found under a scheduled task.

`In use : no (…)` is not decoration. When both an executable path and a cache directory are
configured, the cache is not consulted at all — without that line, administrators will file bugs about
a cache directory that "does nothing".

Failure tail:

```
error: Result: FAILED - no usable browser was found, and taking screenshots would require
       downloading one over the internet.
error: Next steps:
error:     1. On a machine with internet access, run:
error:        butler-sheet-icons browser install --browser chrome --browser-version latest
error:     2. Copy that machine's browser cache directory to this machine, and point Butler Sheet
error:        Icons at it with --browser-cache-dir or BSI_BROWSER_CACHE_DIR.
error:     3. Or, if Chrome or Edge is already installed here, point at it with
error:        --browser-executable-path or BSI_BROWSER_EXECUTABLE_PATH.
```

Both the success and failure output end with the **best-effort disclaimer** specified in §15.7,
immediately before the `Result:` line, in exactly the wording given there. `browser check` ships
before `doctor` does, so it is the first command to give an administrator advice — the disclaimer
cannot wait for the doctor to arrive.

### 7.4 Exit code

**`0`** when a browser was found and (unless `--skip-launch`) launched. **`1`** when no usable browser
was found, or the launch failed.

This is the first BSI command to report failure through an exit code. It is a deliberate, additive
convention — no existing command's exit code changes — chosen so `browser check` can be a gate in a
deployment script on the Sense server.

Set `process.exitCode` **in the handler**, never `process.exit()`, so winston flushes its output. The
worker returns data and does not touch process state.

Name the tension with `src/lib/util/errors.js` rather than leaving a reviewer to find it: that file's
header states that library code throws instead of calling `process.exit(1)` so the top-level
`process.on('uncaughtException')` handler in `src/butler-sheet-icons.js` is the **single source of
process exit logic**. This design keeps the spirit of that rule — the *worker* still never touches
process state, and nothing calls `process.exit()` — but the command handler now sets `process.exitCode`
on a successful, non-throwing run, which is a case the top-level handler cannot see. That is the
narrow, deliberate exception: `browser check` reports a *finding*, not a crash, and a finding has no
exception to propagate. Do not generalise it to other commands without a similarly explicit reason.

---

## 8. Two more changes that belong in this work

### 8.1 `browser install` must succeed offline for an already-staged build

Before calling `canDownload()`, check `getInstalledBrowsers()` for an exact `browser` + `buildId` +
`platform` match. On a hit, log that the build is already installed and return its metadata without
touching the network.

This is what makes staging *verifiable on the air-gapped machine itself*, which is the first thing an
administrator will try. Today they get "cannot be downloaded" for a browser that is sitting right
there (finding 5).

Two things to record honestly:

- **This changes `browser install` from always-reinstall to no-op-if-present.** No `--force` flag in
  this phase; add one only if someone needs reinstall-over-the-top.
- **Only a fully pinned version can short-circuit.** Resolving `latest` still requires the internet,
  because it queries the Chrome version history service. Neither the help text nor the documentation
  may imply otherwise.

### 8.2 Two latent bugs that this work makes visible

**`browserUninstallAll` empties the cache root** (`browser-uninstall.js:146`, `fs.emptyDir`). Today the
blast radius is bounded by the hardcoded `~/.cache/puppeteer`. The moment `--browser-cache-dir` exists,
`BSI_BROWSER_CACHE_DIR=D:\qlik` makes BSI empty a directory it does not own. **Fix this in the same
commit that adds the option**, by iterating the known browser-type subdirectories and removing those
instead of emptying the root. That still solves the original race the current comment documents
(lines 111–116).

**`browserUninstall` never passes `platform`** (`browser-uninstall.js:55-59`, and the same in the
`uninstallAll` loop at 123–127). It finds the entry by `browser` + `buildId`, then calls
`uninstall({browser, buildId, cacheDir})`; the library defaults `platform` to the host, so uninstalling
a foreign-platform build deletes nothing while BSI logs `"… uninstalled."` (finding 6). Latent today —
but it becomes visible the moment the new warnings start telling administrators they have a `win64`
build on a Mac and they try to remove it. Pass `platform: browserToUninstall.platform`.

---

## 9. Tests

This repo writes the failing test first — see the [PR #832](https://github.com/ptarmiganlabs/butler-sheet-icons/pull/832)
description for the standard. Every test below marked **fails today** must be confirmed red against
current `main` before the corresponding code lands.

### 9.1 `browser_detect.test.js`

| Test | Status |
| --- | --- |
| Ignores a cached build made for another platform (cache `win64`, host `mac_arm`) → `null` | **fails today** — this is finding 4 as a unit test |
| Ignores a cached build whose executable is missing → `null` | **fails today** |
| Names the usable cached builds when an exact version pin misses | **fails today** (only a debug line now) |
| Explains that a cache staged on another operating system cannot be used (message names both platforms) | **fails today** |
| `--browser-executable-path` wins over `PUPPETEER_EXECUTABLE_PATH` | **fails today** |
| Explicit missing `--browser-executable-path` throws and never consults the cache | **fails today** |
| Reads the cache from `--browser-cache-dir` | **fails today** |
| Reads the cache from `PUPPETEER_CACHE_DIR` when no option is given | **fails today** (finding 3) |
| Does **not** filter by platform when `detectBrowserPlatform()` returns `undefined` | passes today; guards the regression the new code could introduce |

**Mock-factory trap:** the file currently stubs only `getInstalledBrowsers`. Adding
`detectBrowserPlatform` to the source's imports makes that binding `undefined`, throwing inside the
`try` and breaking four existing tests before any logic change. Add it to the factory. The local
`cachedBrowser()` helper also needs a `platform` argument, and the blanket
`fs.existsSync.mockReturnValue(false)` in the "configured path does not exist" test must become
path-aware, or the cached entry's new existence check fails too.

### 9.2 `commands.test.js`

- `browser check` appears in the registered subcommands. **Fails today.**
- **Structural test, high value:** iterate the command builders, find `--browser-cache-dir`, and assert
  `option.envVar === 'BSI_BROWSER_CACHE_DIR'` and `option.defaultValue === undefined` on every command
  that should carry it. Same for `--browser-executable-path`. **Fails today**, and it is what stops a
  future edit from silently missing one command or reintroducing a `.default()` that masks the
  `PUPPETEER_CACHE_DIR` tier.

### 9.3 `browser_install.test.js`

- Installs into `--browser-cache-dir`. **Fails today.**
- Short-circuits when the exact build is already cached, with `canDownload` never called.
  **Fails today.**
- The existing retry assertion expecting `path.join(homedir(), '.cache', 'puppeteer')` must keep
  passing **untouched** — it is the proof that the default is byte-identical after the refactor.

### 9.4 `browser_uninstall.test.js`

- `uninstall-all` does not empty a directory it does not own. **Fails today.**
- `uninstall` passes the found entry's `platform`. **Fails today.**

### 9.5 New files

`src/lib/browser/__tests__/browser_paths.test.js` — every precedence tier; `''` and whitespace treated
as unset at each tier; relative input resolved to absolute; the SEA tier gated correctly; the
legacy-cache fallback (including that it does **not** apply when an option or `PUPPETEER_CACHE_DIR`
was given); the default rebuilt with the real `homedir()` (this repo never mocks it); and
`resolveBrowserCacheDir(undefined)` / `({})` not throwing.

`src/lib/browser/__tests__/browser_check.test.js` — `ok: true` when the override exists and launch
succeeds; `ok: false, wouldDownload: true` with **`browserInstall` and `canDownload` never called**;
`browser.close()` called even when `version()` throws; `--skip-launch` never calls `puppeteer.launch`;
a wrong-platform cached build listed as `usable: false` with a reason; and **the best-effort
disclaimer is emitted on both the success and the failure path**. That last one guards a requirement
that is otherwise invisible — nothing breaks if the line quietly disappears in a refactor, which is
exactly why it needs a test rather than a code comment.

`src/lib/doctor/__tests__/checks.test.js` — the check contract (§15.3). Each check is pure: given a
fabricated `ctx`, it returns the expected findings without touching the filesystem or the network.
Plus three runner-level guarantees that are cheap now and expensive to retrofit: a check that throws
becomes an `error` finding naming that check rather than taking down the report; a check with
`needsNetwork: true` is skipped unless `--allow-network` is passed; and every finding ID in the
registry is unique. That last one is a one-line test that prevents the ID collisions §15.4 warns
about, at the moment they are introduced rather than after they have shipped in someone's logs.

Optional `browser_cache_dir.integration.test.js` — install into a temp directory via
`--browser-cache-dir`, list it back, uninstall. The `.integration.test.js` suffix is mandatory because
it downloads.

Also update `src/__tests__/butler-sheet-icons.test.js` so `browser --help` contains `check`, and
`browser_launch.test.js` for the changed wrap message (§6.1).

### 9.6 Two hazards in the tests themselves

- **`process.exitCode` leaks across the entire Jest run.** The suite runs `--runInBand` in one process,
  so a test that sets `1` and does not restore it makes `npm run test:unit` report failure with every
  test passing. Save and restore it in `beforeEach`/`afterEach`.
- **`PUPPETEER_CACHE_DIR` must be saved and restored** in every file that exercises cache resolution,
  exactly as `browser_detect.test.js` already does for `PUPPETEER_EXECUTABLE_PATH`. It is ambient — a
  developer shell or CI image may have it set — and it is now behaviour-affecting.

---

## 10. Call sites to change

The eight hardcoded cache-directory sites. Each currently reads:

```js
const browserPath = path.join(homedir(), '.cache/puppeteer');
logger.debug(`Browser cache path: ${browserPath}`);
```

Replace both lines with `const browserPath = resolveBrowserCacheDir(options);` — the resolver emits a
strictly better debug line, so net log volume is unchanged — and drop the now-unused `path` / `homedir`
imports where nothing else needs them.

| File | Line | Note |
| --- | --- | --- |
| `src/lib/browser/browser-detect.js` | 46 | also emits the `info` line when the source is not the default |
| `src/lib/browser/browser-launch.js` | 96 | value is consumed at line 120 by `computeExecutablePath` |
| `src/lib/browser/browser-install.js` | 64 | |
| `src/lib/browser/browser-installed.js` | 30 | |
| `src/lib/browser/browser-uninstall.js` | 34 | |
| `src/lib/browser/browser-uninstall.js` | 99 | plus the `emptyDir` fix, §8.2 |
| `src/lib/browser/browser-list-available.js` | 169 | dead value; swap for consistency, no CLI option |
| `src/lib/browser/browser-list-available.js` | 319 | ditto |

`browser-paths.js` imports `logger` from `../../globals.js`. Every existing browser test already mocks
that specifier, so no test gains a new mock because of this.

---

## 11. Documentation to produce

Per `AGENTS.md`, user-visible changes ship their documentation drafts in the same commit. Drafts go in
`docs/to-doc-site/` as unprefixed kebab-case files and move to `done/` with a `done_` prefix once
published — see `docs/to-doc-site/README.md` for the full workflow.

The doc site is a separate repository
([ptarmiganlabs/butler-sheet-icons-docs](https://github.com/ptarmiganlabs/butler-sheet-icons-docs),
local clone at `/Users/goran/code/butler-sheet-icons-docs`). Write for **Qlik Sense administrators**,
not Node developers: assume Sense expertise and admin access, assume no software-development
background.

**Structure: one new dedicated page, plus targeted edits elsewhere.** The staging README says to
prefer editing existing pages, and that is right for facts — but this content is a long procedural
runbook, and grafting it onto the existing concepts page would turn that page into something it is
not. The new page carries the procedures; the existing pages keep the concepts and point at it.

### 11.1 `docs/to-doc-site/air-gapped-installation.md`

The main deliverable. Target: a **new** page `guide/advanced/air-gapped-installation.md` (that folder
already holds `docker.md`, `proxy.md`, `ci-cd.md`, `crash-dumps.md`, so it is the right home). A new
page also needs a sidebar entry in `docs/.vitepress/config.js`, or it is reachable only by search.

Content, all of it copy-pasteable rather than conceptual:

1. **What "air-gapped" means for BSI.** One short section: everything except obtaining a browser
   already works offline. Set expectations before the procedures.

2. **Route A — use a browser that is already on the server.** The cheapest route and the one most
   QSEoW sites should take. Cover: finding Microsoft Edge or Google Chrome on a Windows Server and
   confirming the executable path; setting `--browser-executable-path`; setting
   `BSI_BROWSER_EXECUTABLE_PATH` instead, for a scheduled task where editing the command line is
   awkward; confirming with `browser check`. Give both a PowerShell example and a scheduled-task
   example. Mention that Edge is Chromium-based and works, and that Microsoft publishes an offline
   enterprise MSI for servers that do not have it — that is the customer's normal software-deployment
   path and needs no BSI-specific handling.

3. **Route B — stage a browser from a connected machine.** Downloading on the connected machine with
   `browser install`; exactly which directory to copy; where to put it on the target; pointing
   `--browser-cache-dir` at it; verifying with `browser install` for the same pinned version (now
   offline-capable) and then `browser check`.

   **State the platform-must-match rule prominently, with its own callout.** It is the most common
   mistake, it is why the connected machine should be the same OS and architecture as the Sense
   server, and BSI now produces a specific warning naming both platforms. Quote that warning.

4. **Where the browser cache lives.** The full precedence list from §4.1; the new standalone-binary
   default beside the executable; the legacy-location fallback message existing users will see once,
   and what to do about it; the writability requirement.

5. **Verifying the installation.** `browser check` in full: annotated sample output for the healthy
   case and for the failing case, what each line means, and the exit codes so it can be used as a gate
   in a deployment script.

6. **A version gate** at the top: `::: warning Requires BSI X.Y.Z or later`. The next version is
   **3.12.0** per the open release-please PR (`chore(main): release butler-sheet-icons 3.12.0`) —
   re-check that PR at publication time rather than trusting this number, since it follows from the
   unreleased commit types.

### 11.2 `docs/to-doc-site/browser-flags-and-cache-dir.md`

Reference-page updates, targeting `reference/browser.md`, `reference/qseow.md` and
`reference/qscloud.md`:

- `--browser-cache-dir` / `BSI_BROWSER_CACHE_DIR` on each of the seven commands that carry it, and an
  explicit note that `browser list-available` does **not** have it and why.
- `--browser-executable-path` / `BSI_BROWSER_EXECUTABLE_PATH` on the three commands that carry it.
- The new `browser check` command: every option, the output sections, and the exit codes.
- The changed `browser install` semantics: no-op when the requested build is already present, and
  `latest` still requiring internet access.

### 11.3 `docs/to-doc-site/browser-detection-updates.md`

Edits to the existing `guide/concepts/browser-detection-and-environment-variables.md`:

- The revised detection order, including where the two new options sit relative to
  `PUPPETEER_EXECUTABLE_PATH`.
- `PUPPETEER_CACHE_DIR` now being honoured — a behaviour change for anyone who already has it set.
- `BSI_BROWSER_EXECUTABLE_PATH` outranking the Docker image's `PUPPETEER_EXECUTABLE_PATH`.
- Short pointers into the new air-gapped page from the existing "Strategy 2" and "Strategy 3"
  sections, so the three strategies do not drift into a fourth copy of the same facts.
- The `PUPPETEER_EXECUTABLE_PATH=""` idiom still works.

### 11.4 Troubleshooting entries

One symptom → cause → fix entry in `guide/troubleshooting.md` per new warning, quoting the message
**verbatim** so it is searchable. At minimum: the platform mismatch, the missing executable, the
pinned-version miss, the explicit-path-missing error, and the unwritable cache directory.

### 11.5 Rules for the publishing pass

- **Verify every claim against the implementation before publishing.** Exact flags, defaults,
  environment variable names and log strings, read from `src/lib/commands/` and `src/lib/browser/` —
  not from these drafts, which are written from intent and can be wrong in detail.
- Add cross-links in both directions: concept page → air-gapped page → reference page, and back.
- `npm run docs:build` in the doc-site repo must pass; it fails on dead links. It does **not** validate
  `#anchor` fragments — check those against the generated HTML, and watch for non-breaking hyphens
  (U+2011) in headings, which survive into anchors and silently break links that look identical.

---

## 12. Sequencing

Ship detection before the options. A `--browser-cache-dir` that then mis-detects a wrong-platform build
inside that very directory is worse than no option at all: it hands the administrator a lever that
makes the failure more confusing. If only one thing can ship, ship the detection fix.

| # | Commit | Contents |
| --- | --- | --- |
| 1 | `refactor: read the browser cache directory from one place` | `browser-paths.js` (default and SEA tiers only — no option, no env var), all 8 call sites, `browser_paths.test.js`. Provably a no-op for non-standalone users. |
| 2 | `fix: stop detection accepting cached browsers this machine cannot run` | Platform filter, executable check, the diagnostic blocks, `browser_detect.test.js` rewrite. |
| 3 | `feat: choose the browser cache directory with --browser-cache-dir` | The option on 6 commands, `PUPPETEER_CACHE_DIR` fallback, the `uninstall-all` safety fix, doc draft. |
| 4 | `feat: point Butler Sheet Icons at a browser with --browser-executable-path` | The option on 2 commands, precedence, `BrowserNotFoundError`, the `launchBrowserForApp` message change, doc draft. |
| 5 | `fix: let browser install succeed offline when the build is already staged` | §8.1. |
| 6 | `feat: add a browser check command` | The check contract, registry and renderer (§15.3–§15.4), the four browser checks, and the command built on them, including both new options. Lands last; its output becomes the standard bug report for air-gapped issues. |
| 7 | `fix: uninstall the browser build that was actually found` | The `platform` bug, §8.2. Independent of everything else. |

Documentation drafts go **inside** commits 3–6, not in a separate `docs:` commit.

Commits 1 and 2 are the pair that must not be separated in a release. Commit 4 is independent and
cheap — it can slip, since `PUPPETEER_EXECUTABLE_PATH` already covers the underlying capability.

Conventional Commit types configured in `release-please-config.json`: `feat` (minor), `fix` (patch),
`chore`, `docs`, `build`, and `refactor` (hidden from the changelog).

---

## 13. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Platform filtering removes a configuration that works today | Low, but real — e.g. a `win64` cache on Windows 10 on ARM, where `detectBrowserPlatform()` returns `win32` | The warning names both platforms, and `--browser-executable-path` is an immediate escape hatch. Call the trade-off out in the changelog rather than pretending it is free. |
| Standalone default moves; existing users' caches become invisible | Medium — would mean a ~150 MB re-download, catastrophic if already offline | The read-only legacy fallback (§4.2) and its `info` line. This is the single most important mitigation in the change. |
| `PUPPETEER_CACHE_DIR` starting to be honoured | Low | `info` line whenever a non-default source wins; documented in §11.3. |
| `BSI_BROWSER_EXECUTABLE_PATH` outranks the Docker image's `PUPPETEER_EXECUTABLE_PATH` | Low; intended | Documented. |
| `browser install` becomes a no-op for an already-present build | Low | Documented; `--force` available as a follow-up if anyone needs it. |
| `browser check` exit code 1 | Low; additive | No existing command's exit code changes. |
| Hard failure on a missing explicit `--browser-executable-path` | None | Brand-new option; `PUPPETEER_EXECUTABLE_PATH` behaviour deliberately untouched. |

---

## 14. Definition of done

- `npm run lint` and `npm run test:unit` pass.
- Every test in §9 marked "fails today" was confirmed red against current `main` before its fix landed.
- `browser check` on a machine with no browser and no internet exits `1` and prints the three next
  steps — no network timeout, no stack trace.
- `browser check` on a machine with a staged browser exits `0` and reports the launched version.
- **`browser check` prints the best-effort disclaimer (§15.7) on both the success and failure paths**,
  in the agreed wording, with no flag that suppresses it.
- A cache staged from a different operating system produces the platform-mismatch warning naming both
  platforms, and detection returns `null` rather than a broken path.
- An existing standalone user with a browser in `~/.cache/puppeteer` and nothing beside the binary
  still finds it, and sees the one-line migration message.
- Drafts for §11.1–11.4 exist in `docs/to-doc-site/`, unprefixed.
- `docs/browser-detection-environment-variables.md`'s detection pseudo-code and
  `detectAvailableBrowser`'s JSDoc both describe the new order.
- **A fifth diagnostic check can be added with one new file and one registry line**, with no change
  to the runner, the renderer or any command. This is the acceptance test for §15.3 — if it does not
  hold, the contract is wrong and the next diagnostic will be as expensive as the first.

Note that markdown in this repository is **not** Prettier-formatted — existing files under `docs/` do
not pass `prettier --check`, and the `format` script covers `src/**/*.js` only. Do not reformat them.

---

## 15. Beyond phase 1: the `doctor` command

`browser check` (§7) answers one question about one subsystem. The same machinery, generalised,
answers the question administrators actually arrive with: *"BSI failed — why, and what do I do?"*

This section designs that generalisation. **Only §15.3 and §15.4 are phase-1 work**; the rest is
designed now so that phase 1 builds towards it instead of away from it. §15.8 sets out what to build
when.

### 15.1 Why this belongs in a phase 1 document

If `browser check` ships as a bespoke command that gathers facts and formats them inline, then the
first additional diagnostic — a Qlik connectivity check, a certificate check — either duplicates that
structure or triggers a rewrite of a command users already depend on. Both outcomes are avoidable at
a cost of maybe a third more work now.

So the constraint on phase 1 is narrow but firm: **`browser check` must be a consumer of the check
contract, not a standalone implementation.** Its command, its output and its exit codes stay exactly
as designed in §7. What changes is that the facts come from registered checks rather than from a
single function, and the formatting comes from a shared renderer.

### 15.2 Command surface

BSI's established shape is `namespace subcommand`, so `doctor` becomes a namespace:

| Command | Purpose |
| --- | --- |
| `doctor check` | Run diagnostic checks against this machine and report findings. Commander's `isDefault` makes it what bare `doctor` runs. |
| `doctor analyze` | Investigate a specific failure — a crash dump, a log file, or a pasted error message — and say what probably caused it. |
| `doctor explain <finding-id>` | Print the full explanation and remediation for one finding ID. |

`browser check` stays. It is discoverable where a user with a browser problem is already looking, and
after §15.3 it is a thin alias for `doctor check --area browser`. Keeping both costs one small file
and makes neither redundant, because they are found by different people at different moments.

`doctor explain` is not a nicety. An air-gapped administrator cannot open
butler-sheet-icons.ptarmiganlabs.com, so a finding that says "see the documentation" is useless to
exactly the audience this whole document is about. Shipping the explanations in the binary is what
makes the diagnostics self-sufficient offline.

### 15.3 The check contract

A check is a module that gathers facts and returns findings. It does not log, does not format, and
does not touch process state — the same pure-core/logging-shell split already proven by `checkEnv()`
in `src/lib/util/env-check.js`.

```js
export const check = {
    id: 'browser-cache-platform',          // stable, kebab-case, unique
    title: 'Cached browsers match this machine',
    area: 'browser',                       // browser | environment | config | qseow | qscloud
    needsNetwork: false,                   // true checks are skipped unless --allow-network
    appliesTo: (ctx) => true,              // cheap predicate; skip irrelevant checks
    run: async (ctx) => [ /* Finding[] */ ],
};
```

`ctx` is a plain object assembled once per run and handed to every check: the resolved options, a
snapshot of the relevant environment variables, the platform facts from §7.3, the resolved cache
directory and executable override from §3, and a `logger` for `debug` only. Passing facts in rather
than letting checks read the world is what makes them unit-testable without mocking the filesystem.

`src/lib/doctor/checks/index.js` is a flat registry — an array of imported checks. **Adding a check
is one new file plus one array entry, with no change to the runner.** That property is the whole
point; anything that erodes it (a check that needs a special case in the runner, a finding that needs
bespoke formatting) is a signal that the contract is wrong, not that the check is special.

Two rules the runner enforces rather than trusting:

- **A check may not mutate anything.** No installs, no file writes, no `process.exitCode`.
- **A check may not reach the network or Qlik Sense unless `needsNetwork` is set and
  `--allow-network` was passed.** The default must be safe to run on a production Sense server at any
  time, and — per §7.1 — must never hang on a DNS timeout on an air-gapped host.

The four browser checks that fall out of phase 1 directly: executable override resolves and exists;
cached builds match the host platform; cached builds have present executables; the browser actually
launches (`needsNetwork: false` — it is a local process).

### 15.4 Findings and stable IDs

```js
{
    id: 'BSI-BROWSER-003',            // stable, documented, searchable
    severity: 'error',                // error | warning | info | ok
    title: 'Cached browsers were built for a different operating system',
    detail: 'The cache holds 2 chrome build(s), all for mac_arm. This machine is win64.',
    evidence: { cacheDir: '...', hostPlatform: 'win64', cachedPlatforms: ['mac_arm'] },
    remediation: [
        {
            text: 'Stage the browser from a machine running the same operating system.',
            command: {
                powershell: 'butler-sheet-icons.exe browser install --browser chrome --browser-version latest',
                bash: './butler-sheet-icons browser install --browser chrome --browser-version latest',
            },
        },
    ],
    docs: 'guide/advanced/air-gapped-installation#platform-must-match',
}
```

Design rules, in order of how expensive they are to get wrong:

- **Finding IDs are permanent and append-only.** They will appear in logs, in GitHub issues, in the
  doc site's troubleshooting entries, and in `doctor explain`. Never reuse an ID, never renumber, and
  retire one by marking it obsolete rather than deleting it. Reserve a block per area
  (`BSI-BROWSER-*`, `BSI-ENV-*`, `BSI-QSEOW-*`) so areas can grow independently.
- **`severity: 'ok'` findings are emitted, not omitted.** "I checked this and it is fine" is what
  lets an administrator rule a cause out, and it is what makes the output usable as a bug report.
- **`detail` states what was observed, with the actual values.** "No browser found" helps nobody;
  "the cache at `D:\bsi\cache` holds 2 chrome builds, all for mac_arm, and this machine is win64"
  ends the investigation.
- **`remediation` is ordered and concrete, and commands are platform-keyed.** The renderer prints the
  one matching the host. BSI's primary platform is Windows Server, where a bash snippet is noise.
- **`docs` is a relative doc-site path**, resolved to a URL by the renderer and printed as a bare
  path when offline.

The §6.3 warnings and these findings must not drift into two separate wordings of the same fact.
Where a detection warning and a finding describe the same condition, the finding's `title` and
`detail` are the source of truth and the log line quotes them.

### 15.5 `doctor analyze`: from symptom to confirmed cause

Inputs, in the order they are most likely to be used:

| Input | Notes |
| --- | --- |
| `--log <file>` | A BSI log file. The common case — most BSI failures are caught and logged, not crashes. |
| `--error <text>` | A pasted error message, for the administrator who has a terminal scrollback and nothing else. |
| `--crash-dump <file>` | BSI's own crash dump JSON. Well-defined (`version: '1.0'`, `error.{type,message,stack}`, `runtime`, `context.source`) and **already redacted at write time**. |
| *(none)* | Defaults to the newest crash dump in `BSI_CRASH_DUMP_DIR`. |

Be honest in the documentation about the crash-dump limitation: `writeCrashDump()` fires only from
the top-level `uncaughtException` / `unhandledRejection` handlers, so most BSI failures never produce
one. `--log` is the primary input.

Analysis has two stages, and the second is what makes this worth building:

1. **Match.** Compare the input against a *symptom catalogue* — one entry per known failure mode,
   holding match rules (substring, regex, or an `error_category` from `getErrorCategory()`) and the
   candidate causes each implies. For structured errors, prefer `getErrorCategory()` and
   `getErrorMetadata()` from `src/lib/util/error-categorizer.js` over pattern-matching the message
   text; they already classify timeouts, refused connections, unresolved hosts, auth failures,
   certificate errors and HTTP status classes.
2. **Confirm.** For each candidate cause, run the checks that would prove or disprove it *on this
   machine*, and report accordingly.

Stage 2 is the difference between a lookup table and an investigator. "Your error matches
`cannot be downloaded`, which usually means no internet access" is a guess. "Your error matches
`cannot be downloaded`; I checked, and this machine has a usable chrome 138.0.7204.94 staged at
`D:\bsi\cache`, so the problem is the pinned `--browser-version`, not connectivity" is an answer.

A symptom entry is data, not code:

```js
{
    id: 'browser-download-blocked',
    match: { anyOf: [{ contains: 'cannot be downloaded' }, { errorCategory: 'host_not_found' }] },
    causes: ['no-internet-access', 'version-pin-miss', 'proxy-intercepts-https'],
    confirmWith: ['browser-cache-platform', 'browser-cache-executable'],
}
```

### 15.6 How this evolves

The requirement is that the command keeps pace with BSI and with what users report. That reduces to
making the response to a hard support question mechanical:

1. Add a symptom entry (data) so the failure is recognised.
2. Add or extend a check (one file, one registry line) if confirming the cause needs a new fact.
3. Allocate the next finding ID in that area's block and write its explanation.
4. Add the matching troubleshooting entry to the doc site, quoting the finding verbatim.

No runner changes, no renderer changes, no command changes. **If a new diagnostic cannot be added
without touching the runner, that is a defect in the contract** — fix the contract rather than
special-casing the check.

Two things this must not become: a remote-fetched rule set (air-gapped hosts cannot fetch, and a
diagnostic that silently changes is unsupportable), and a catalogue of speculative entries. Every
symptom entry should trace to a real reported issue, and carry that issue number in a comment — an
entry nobody has ever hit is a maintenance cost with no reader.

### 15.7 Output, redaction and exit codes

Human output groups findings by severity, worst first, and prints the platform-appropriate
remediation command ready to paste. `--output json` emits the findings array for scripting — and,
more usefully, gives support a complete machine-readable picture to ask for in a GitHub issue.

#### The best-effort disclaimer

**Every command in this family states, in its own output, that its suggestions are best-effort.** This
is the primary mitigation for the "wrong advice is worse than none" risk in §15.9, and it is a
requirement rather than a courtesy: BSI is reasoning from what it can observe on one machine, and it
cannot see group policy, antivirus rules, proxy configuration, filesystem permissions it did not
happen to test, or anything about the Qlik Sense installation itself.

Rules:

- **It is not suppressible in human output.** There is no `--no-disclaimer`. A flag to hide it would
  be used by exactly the automated contexts where a human later reads the output without knowing it
  was hidden.
- **It appears once**, immediately before the `Result:` line, so it is the last thing read and sits
  next to the advice rather than scrolled away above it.
- **It is a field in JSON output**, not just prose, so it survives into anything that reformats the
  report:

  ```json
  { "disclaimer": "Findings are best-effort ...", "findings": [ ... ] }
  ```

- **It pairs with per-finding confidence.** The disclaimer covers the general case; the renderer must
  additionally distinguish a finding *confirmed on this machine* from a *possible cause* inferred
  from a symptom match (§15.5). A blanket disclaimer is not a licence to present guesses as facts.

Proposed wording, to be used verbatim by `doctor check`, `doctor analyze` and `browser check` alike:

```
Note: these findings are best-effort. Butler Sheet Icons reports what it can observe on this
machine, and cannot see everything about your environment - group policy, antivirus, proxy rules
and Qlik Sense itself are all invisible to it. Review suggested commands before running them on a
production server.
```

Keep the wording identical across the three commands. An administrator who has read it once should
recognise it and skip it, rather than having to re-read a variant.

**Redaction is a hard requirement, not a nicety.** The entire value of the JSON output is that people
will paste it into public issues, and `doctor analyze --log` reads files that may contain passwords,
API keys and certificates. Every finding — `detail`, `evidence` and any quoted input — must pass
through `redactSensitivePatterns()` / `redactValue()` from `src/lib/util/redact-secrets.js` before it
reaches any output. Test that explicitly, with a log fixture containing a known secret pattern; this
is the one place in the design where a bug is a disclosure rather than an inconvenience.

Exit codes follow §7.4 with the same reasoning:

- `doctor check` — `0` when no `error`-severity finding, `1` otherwise. Scriptable as a deployment
  gate.
- `doctor analyze` — always `0` unless its input could not be read. It reports; it does not gate.
  Exiting non-zero because it *found* something would break its use inside troubleshooting scripts.

### 15.8 What to build when

| Stage | Scope | Cost |
| --- | --- | --- |
| **Phase 1** | The check contract, the registry, the renderer, and the four browser checks. `browser check` built on them, behaving exactly as §7 specifies. | ~⅓ more than a bespoke `browser check`; avoids a rewrite later. |
| **Next** | `doctor check` running every registered check, `--area` filtering, `--output json`. | Small — the runner already exists; this is a command plus a renderer mode. |
| **Later** | `doctor explain`, the symptom catalogue, and `doctor analyze`. Environment and Qlik connectivity checks as demand appears. | The largest piece, and the one that should be driven by real reported issues rather than designed up front. |

The staging matters because the value is back-loaded but the cost is front-loaded. Phase 1 buys the
structure; the payoff arrives when the second and third checks cost almost nothing to add.

### 15.9 Risks

| Risk | Mitigation |
| --- | --- |
| **Wrong advice is worse than none.** An administrator who follows a confident, incorrect remediation on a production Sense server loses trust permanently. | Three layers. (1) The non-suppressible best-effort disclaimer in §15.7, in every command in this family. (2) Every remediation verified against a real reproduction before it ships. (3) The renderer distinguishes "confirmed on this machine" from "possible cause", so a symptom match is never presented as a diagnosis. The disclaimer sets expectations; it does not excuse an unverified remediation. |
| Secret disclosure via `--output json` or `analyze --log` | §15.7. Mandatory redaction, with a dedicated test. |
| Catalogue rot — entries describing behaviour that has since changed | Tie every entry to a real issue number; review the catalogue when the code it describes changes. Prefer confirming with a live check over asserting from a pattern, because a check fails visibly when the code moves. |
| Scope creep into a general Qlik Sense diagnostic tool | The boundary is BSI's own operation. Checking that BSI can reach the Sense host is in scope; diagnosing the Sense installation is not. |
| A diagnostic command that itself crashes | The runner isolates each check in `try/catch` and turns a thrown check into an `error` finding naming the check. One broken check must never take down the report. |
