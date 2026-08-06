# Using browser commands without internet access

Target page: `docs/guide/concepts/browser-detection-and-environment-variables.md` on the doc site,
as a new section after "### 3. Download browser (lowest priority)". Alternatively
`docs/guide/troubleshooting.md`, if a troubleshooting entry reads better there.

This documents behaviour that changes in the next release. Before it, running
`browser list-available` on a machine with no internet access produced an unhelpful error:

```
error: Error checking for available browsers: TypeError: Cannot read properties of undefined (reading 'status')
error: BROWSER MAIN 10: TypeError: Cannot read properties of undefined (reading 'status')
error: BROWSER MAIN 10 (message): Cannot read properties of undefined (reading 'status')
error: BROWSER MAIN 10 (stack): TypeError: ...
    at ./build/build.cjs:172381:26
    ...
```

Nothing in that output said "this machine cannot reach the internet".

## Suggested new section

> ### Which browser commands need internet access?
>
> Only some of the `browser` commands reach out to the internet:
>
> | Command | Needs internet? |
> |---|---|
> | `browser list-installed` | No. Reads the local Puppeteer cache only. |
> | `browser uninstall` / `uninstall-all` | No. Removes browsers from the local cache. |
> | `browser list-available` | **Yes.** Asks Google's Chrome version history service which versions exist. |
> | `browser install` | **Yes**, unless the requested version is already in the cache. |

<!--
Correction made while publishing: the `browser install` row above is wrong. `browserInstall()` calls
`canDownload()` from `@puppeteer/browsers` before `install()`, and `canDownload()` issues a network
HEAD request. So `browser install` needs internet access *always*, including when the requested
build is already cached — offline it fails with "cannot be downloaded" rather than reusing the
cache. The published page states this correctly.
-->
>
> On a machine with no internet access — an air-gapped server, or one behind a proxy that blocks
> outbound HTTPS — the two commands that need it will report:
>
> ```
> error: Could not reach versionhistory.googleapis.com to look up available browser versions.
> error: Butler Sheet Icons needs internet access for this command. If this machine is offline or
>        behind a proxy, use "butler-sheet-icons browser list-installed" to see the browsers already
>        available locally.
> ```
>
> This is expected, not a fault in Butler Sheet Icons. Use `browser list-installed` to see what is
> already available on the machine.
>
> To prepare an offline machine, run `browser install` once while it still has internet access. The
> browser is stored in the Puppeteer cache and reused on later runs, so thumbnail creation itself
> works without connectivity. Setting `PUPPETEER_EXECUTABLE_PATH` to a browser installed by other
> means works too, and is the usual approach for Docker and centrally managed environments.

## Why this matters to administrators

The previous output was a stack trace referencing line numbers inside the bundled binary, which is
not something an administrator can act on. Several support questions have started this way.

If the service is reachable but returns an error, the message now says so explicitly and quotes the
HTTP status, so a proxy returning 403 is distinguishable from no connectivity at all.

## Note for the reviewer publishing this

Check whether the air-gapped guidance already exists elsewhere on the site before adding a new
section — issues #809 and #810 cover air-gapped support more broadly, and it would be better to
have one place describing it than two. If a dedicated air-gapped page lands from that work, this
content belongs there instead.
