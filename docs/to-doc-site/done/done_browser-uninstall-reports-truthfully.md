# `browser uninstall` now tells you the truth about what it removed

Until now, `butler-sheet-icons browser uninstall` could report that it had removed a browser while the
browser was still on disk. The command printed a success message, exited with code 0, and left the files
exactly where they were.

This is fixed. The command now checks the cache after removing a browser and reports what actually
happened.

## When did this go wrong?

Only in one situation, but it is one that real installations hit: when the cached browser was downloaded
for a **different platform** than the machine you are running on.

Butler Sheet Icons stores downloaded browsers in a cache directory, and each build in that cache is
labelled with the platform it was built for — `win64`, `mac_arm`, `linux`, and so on. A cache can end up
holding builds for another platform in several ordinary ways:

- The cache directory was copied from one machine to another, for example when preparing an offline
  server.
- The cache is on a shared or network drive used by more than one machine.
- The cache is mounted into a Docker container from a host running a different operating system.

In those cases the old code found the build by name and version, but then asked the operating system to
delete it from the *current* machine's platform folder — a folder that does not exist for a
foreign-platform build. Nothing was deleted, no error was raised, and the success message printed anyway.

An administrator clearing disk space had no way to tell from the output that nothing had happened.

## What you will see now

### When the removal works

Unchanged:

```
info: Uninstalling browser: chrome, build id=151.0.7922.77, platform=mac_arm, path=/Users/admin/.cache/puppeteer/chrome/mac_arm-151.0.7922.77
info: Browser "chrome", version "151.0.7922.77" uninstalled.
```

### When the removal fails

Previously this printed the same success message. Now:

```
error: Browser "chrome", version "151.0.7922.77" (built for win64) could not be removed. It is still in the cache at /Users/admin/.cache/puppeteer/chrome/win64-151.0.7922.77.
```

The command also exits with a **non-zero exit code**, so a scheduled job or script can detect the failure
instead of silently continuing. If you script browser cleanup, this is the change most likely to affect
you — a job that previously appeared to succeed may now correctly report a failure.

### When the same version exists for two platforms

A cache can hold the same build for more than one platform. Butler Sheet Icons now says so, and removes
the one that can actually run on this machine first:

```
warn: Build 151.0.7922.77 is cached for 2 platforms (win64, mac_arm). Removing the "mac_arm" build; re-run to remove the next one.
```

Run the command again to remove the second one. Previously the choice between them was effectively
arbitrary — whichever the file system happened to list first.

## Can I still remove a browser built for another platform?

Yes, and this is worth stating plainly: builds for other platforms are **still removable**. Wanting the
disk space back is a perfectly good reason to delete a browser you cannot run.

What has changed is only that the removal now actually happens, and that you are told which platform's
build was removed.

## Do I need to do anything?

No. The improvement applies automatically.

It is worth running `butler-sheet-icons browser list-installed` once on any machine where you have
previously cleaned up browsers, to check whether builds you believed were deleted are still there. If they
are, `browser uninstall` will now remove them properly.

## Related

- [Cached browser reuse](./done/done_browser-cache-reuse.md) — how the cache is used on subsequent runs.
- [Browser commands without internet access](./done/done_browser-commands-without-internet.md) — preparing
  a machine that will later run offline, which is one of the ways a cache ends up holding
  foreign-platform builds.
