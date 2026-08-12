# Choosing where Butler Sheet Icons keeps its browser

Butler Sheet Icons drives a real Chrome browser to take the sheet screenshots. That browser is
downloaded once and kept in a folder called the **browser cache**.

Until now that folder was fixed: the `.cache/puppeteer` folder in the home directory of whichever
account was running Butler Sheet Icons. Two things change:

- You can now say where it is, with `--browser-cache-dir` or the `BSI_BROWSER_CACHE_DIR`
  environment variable.
- The **standalone builds** — `butler-sheet-icons.exe` on Windows, `butler-sheet-icons` on Linux and
  macOS — now keep the browser in a `browser-cache` folder **next to the executable** instead.

Nothing changes if you run Butler Sheet Icons from Node.js or from the Docker image.

Target page: a new page under `guide/advanced/`, cross-linked from
`guide/concepts/browser-detection-and-environment-variables.md` and from the `browser`, `qseow` and
`qscloud` reference pages.

## Why the home directory was the wrong place

On a Qlik Sense Enterprise on Windows server, Butler Sheet Icons is usually run by the scheduler or as
an external program task — that is, by a **service account**, not by you.

If that account is LocalSystem, its home directory is
`C:\Windows\system32\config\systemprofile`. So when you sign in as yourself, run
`butler-sheet-icons browser install`, and see it succeed, the browser lands in **your** profile. The
scheduled task then looks in the service account's profile, finds nothing, and downloads its own copy —
or, on a server with no internet access, fails.

Nothing in the old output explained this, because both runs printed the same reassuring lines.

Keeping the browser next to the executable makes it follow the **installation** rather than the account
that happens to run it. Everyone who runs that copy of Butler Sheet Icons uses the same browser.

## Where Butler Sheet Icons looks

The first of these that is set wins:

| Order | Location | Set by |
|---|---|---|
| 1 | The directory you name | `--browser-cache-dir <directory>` or `BSI_BROWSER_CACHE_DIR` |
| 2 | The directory `PUPPETEER_CACHE_DIR` names | `PUPPETEER_CACHE_DIR` |
| 3 | `browser-cache` next to `butler-sheet-icons(.exe)` | Automatic, **standalone builds only** |
| 4 | `.cache/puppeteer` in the current user's home directory | Automatic, everything else |

Butler Sheet Icons says which one it used whenever it is not the last one, so a log tells you where it
looked:

```
2026-08-12T07:11:05.039Z info: Browser cache directory: D:\qlik\browsers (from --browser-cache-dir / BSI_BROWSER_CACHE_DIR)
```

A relative path is resolved against the current working directory and logged in full. Under a scheduled
task the working directory is rarely what you expect, so prefer a full path such as `D:\qlik\browsers`.

Setting the variable to nothing at all — a bare `BSI_BROWSER_CACHE_DIR=` line in a `.env` file or a
container definition — means "not set", and Butler Sheet Icons moves on to the next row of the table.

## If you already have a browser in the old location

Standalone builds keep working. When there is no browser next to the executable but there is one in the
old location, Butler Sheet Icons uses the old one and says so, once, per run:

```
2026-08-12T07:12:27.745Z info: No browsers found in C:\butler-sheet-icons\browser-cache, but 1 was found in the previous default location C:\Users\svc_qlik\.cache\puppeteer. Using the previous location for now. Move that directory next to the Butler Sheet Icons executable, or set --browser-cache-dir, to keep using it.
```

Nothing is re-downloaded and nothing breaks, so there is no hurry. To make the message go away, do one
of the following:

- Move the folder. Copy `C:\Users\svc_qlik\.cache\puppeteer` to
  `C:\butler-sheet-icons\browser-cache`, so that the `chrome` folder inside it ends up as
  `C:\butler-sheet-icons\browser-cache\chrome`.
- Or keep it where it is, and set `BSI_BROWSER_CACHE_DIR=C:\Users\svc_qlik\.cache\puppeteer`.
- Or run `butler-sheet-icons browser install` once, which downloads a browser into the new location.

Two details worth knowing:

- Reading from the old location is a **fallback only**. An install always writes to the location in the
  table above, so once you install a browser next to the executable, that is the one that gets used.
- The fallback applies only to the standalone default. If you name a directory yourself, or set
  `PUPPETEER_CACHE_DIR`, Butler Sheet Icons uses exactly that and does not look anywhere else — if you
  said where the browser is, it will not quietly read a different copy.

## `PUPPETEER_CACHE_DIR` now does something

`PUPPETEER_CACHE_DIR` is a well-known variable in the Puppeteer world, and Butler Sheet Icons has always
ignored it. It is now honoured, ranking just below Butler Sheet Icons' own setting.

If you already have it set on a machine for other reasons, Butler Sheet Icons will start looking there
and may report that no browsers are installed. The `info` line above is what tells you that has
happened. Either point it at the folder that holds your browser, or set `BSI_BROWSER_CACHE_DIR`, which
wins over it.

`PUPPETEER_EXECUTABLE_PATH` is unchanged and is a different thing: it names one browser **binary** to
use and skips the cache entirely.

## Which commands accept it

| Command | `--browser-cache-dir` |
|---|---|
| `browser install` | Yes — this is where the browser is downloaded to |
| `browser list-installed` | Yes |
| `browser uninstall` | Yes |
| `browser uninstall-all` | Yes |
| `qseow create-sheet-thumbnails` | Yes |
| `qscloud create-sheet-thumbnails` | Yes |
| `browser list-available` | **No** — it lists what is published for download and never reads the cache |

The environment variable is `BSI_BROWSER_CACHE_DIR` for all of them. It is deliberately **not**
per-command, unlike most Butler Sheet Icons variables: where the browser lives is a property of the
machine, and the folder `browser install` writes to has to be the one `create-sheet-thumbnails` reads
from. Set it once, in the environment the scheduled task runs in, and every command agrees.

Both thumbnail wizards (`-i`) ask about it under **advanced options**, where you can leave it blank.

## If the folder cannot be written to

A standalone build unzipped under `C:\Program Files\` cannot write next to itself. `browser install`
now stops immediately and says what to do, instead of failing part-way through a 150 MB download with a
permission error:

```
2026-08-12T07:11:41.546Z error: Cannot write to the browser cache directory C:\Program Files\butler-sheet-icons\browser-cache. Choose a writable location with --browser-cache-dir or BSI_BROWSER_CACHE_DIR, or run Butler Sheet Icons from a directory you can write to.
```

The exit code is 1.

## `browser uninstall-all` no longer empties the whole folder

This matters now that the folder can be one you chose. `browser uninstall-all` used to delete
**everything** in the browser cache directory. It now removes only the subfolders it owns —
`chrome`, `chrome-headless-shell`, `chromium`, `firefox` and `chromedriver` — so pointing
`--browser-cache-dir` at a folder that also holds other files is safe.

## Examples

Windows, one location for the whole server, set once for the scheduled task:

```
BSI_BROWSER_CACHE_DIR=D:\qlik\butler-sheet-icons\browsers
```

Then, signed in as yourself, stage the browser into that same folder:

```
butler-sheet-icons.exe browser install --browser-cache-dir D:\qlik\butler-sheet-icons\browsers
```

Check what is there, as the service account or as yourself — the answer is now the same either way:

```
butler-sheet-icons.exe browser list-installed --browser-cache-dir D:\qlik\butler-sheet-icons\browsers
```

## Note for the publishing pass

Do not hand-write the option rows into the reference pages. Regenerate the tables for the six commands
above with `npm run docs:cli-tables`, so the flag, the environment variable and the description come
from the code.
