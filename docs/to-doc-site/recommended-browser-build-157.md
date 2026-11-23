# The recommended browser build is now Chrome 157 (doc site update)

Target pages:

- `docs/guide/concepts/browser-management`: wherever the page names the current recommended
  build, or shows it in example output.
- Release notes / upgrade notes for the next release: the "Before you upgrade" text below.

::: warning Requires the next Butler Sheet Icons release
This describes behaviour that is not in the current release. Publish to the doc site's `next`
branch. Take the release number from the open `release-please` pull request title before
publishing.
:::

## What changed

When `--browser-version` is left at its default, `recommended`, Butler Sheet Icons uses the Chrome
build it was tested with. That build is fixed inside each release and only changes when you
upgrade Butler Sheet Icons.

From the next release, the recommended build is **Chrome 157.0.8103.50**. Butler Sheet Icons 5.5.0
recommends **Chrome 151.0.7922.71**.

You can see which build your installed version recommends at any time:

```bash
butler-sheet-icons browser check
```

The `Requested` line shows `chrome recommended (build ...)`.

## What this means for you

**Servers with internet access:** nothing to do. On the first run after the upgrade, Butler Sheet
Icons downloads Chrome 157.0.8103.50 into its browser cache and uses it from then on.

**Servers without internet access (air-gapped, or behind a proxy that blocks the download):** the
Chrome 151 build already in the cache no longer matches `recommended`. The first run after the
upgrade logs a warning like this one and then tries to download the new build, which fails
offline:

```
warn: No cached chrome build matches --browser-version "recommended" (build 157.0.8103.50). Cached chrome builds that this machine can run: 151.0.7922.71. ...
```

Before you upgrade an offline server, do one of the following:

1. **Stage the new build (recommended).** On a machine with internet access and the same operating
   system, upgrade Butler Sheet Icons, run `butler-sheet-icons browser install`, and copy the
   browser cache to the offline server, as you did for the original install.
2. **Keep using the build you have.** Pin it explicitly:

    ```bash
    butler-sheet-icons qseow create-sheet-thumbnails --browser-version 151.0.7922.71 ...
    ```

    This works, but you will be running a browser build this release was not tested with. Treat it
    as a stop-gap until the new build is staged.

**Docker image:** not affected. The image uses the Chromium that is installed inside the image, not
a downloaded Chrome build.

Once the new build is in place, you can remove the old one to free disk space with
`butler-sheet-icons browser uninstall --browser-version 151.0.7922.71`.
