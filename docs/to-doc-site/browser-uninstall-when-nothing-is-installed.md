# "Uninstall a browser" now says when there is nothing to uninstall

If you ran `butler-sheet-icons browser uninstall -i` on a server with no browsers in the cache, it asked
you which build to remove anyway — and the question it asked was the help text for `--browser-version`:

```
? Browser build to uninstall: an exact build id (for Chrome e.g. "151.0.7922.77", for Firefox e.g.
"stable_153.0.3"), or "recommended" for the build Butler Sheet Icons is tested with.
```

There was no answer to that question that could work. Whatever you typed, the run ended with
`Browser not found in cache`.

It now reports the situation and stops, without asking anything:

```
2026-08-11T20:12:38.100Z info: App version: 4.1.0
2026-08-11T20:12:38.102Z info: No browsers installed, so there is nothing to uninstall. Use "butler-sheet-icons browser install" to install one.
```

The exit code is **0**. Nothing was asked for, so nothing failed — the same answer
`butler-sheet-icons browser list-installed` gives on that machine.

## When you have a build id set from an earlier run

The confusing part of the old behaviour showed up most often on a machine where a previous session had
left `BSI_BROWSER_UI_BROWSER_VERSION` in a `.env` file. Butler Sheet Icons announced that it would not
ask about `--browser-version`, and then asked for exactly that.

Two things changed:

- With **no browsers installed**, you get the message above. The leftover value makes no difference —
  there is nothing to remove either way.
- With **browsers installed**, you are still asked to pick one, and Butler Sheet Icons now says why
  rather than claiming the question was skipped:

  ```
  Supplied, but asked about again so the answer can be picked from what is actually there: --browser-version.

  ? Which browser build should be removed?
  ❯ chrome  151.0.7922.108  (mac_arm)
  ```

  This is deliberate. A build id remembered from an earlier run may name a build you have since removed,
  or one that was never on this machine. The list is read from the cache each time, so what you pick
  always exists.

## What has not changed

Running `browser uninstall` **without** `-i` behaves exactly as before. Naming a build that is not in
the cache still reports it and still exits 1, which is what your scheduler or CI job sees:

```
info: Browser not found in cache: chrome build 151.0.7922.77. Use "butler-sheet-icons browser list-installed" to see what is installed.
```

`browser install -i`, `browser list-installed` and `browser uninstall-all` are unaffected.
