# When the browser takes a very long time to start

Butler Sheet Icons creates thumbnails by starting a Chrome browser in the background and photographing each sheet. Starting that browser normally takes a second or two.

Occasionally it takes very much longer — minutes rather than seconds — with nothing in the log to say why. This page describes a warning that now explains it, and what to do about it. It belongs with the troubleshooting material.

Nothing here needs configuring. There are no new options.

## What you will see

The last thing in the log is the line saying the browser is being started, and then nothing at all for a long time:

```
info: Browser setup complete. Launching browser...
```

If Butler Sheet Icons eventually gets the browser running, it now follows that silence with an explanation:

```
warning: QSEOW: Browser launch took 1500s, longer than the 30s launch timeout allows for.
         The extra time went into starting the browser process, which no timeout covers.
warning: QSEOW: On Windows this is typically antivirus or endpoint protection scanning a
         browser executable it has not seen before. Excluding the Butler Sheet Icons browser
         cache directory from real-time scanning avoids it.
```

(Both lines are shown wrapped here; each is a single line in the log. The prefix at the start names the stage the run was in, and differs between commands.)

The run itself is not damaged by this. The thumbnails are created normally once the browser finally starts — it is the waiting that is the problem, and on a scheduled run it can be long enough that the run appears to have frozen.

## What is actually happening

Butler Sheet Icons asks the operating system to start the browser, and the operating system does not come back. This is not the browser being slow; it is the request to start it being held.

On Windows, the usual reason is security software inspecting the browser program before it is allowed to run. Butler Sheet Icons downloads its own copy of Chrome, so the first run after a browser download presents the scanner with a program it has never seen before. Some products will send such a file away to be analysed and hold it until an answer comes back. If that lookup is slow — or the machine's route to the vendor's service is blocked — the wait can be extremely long.

Two details worth knowing:

- **It typically strikes once, then disappears.** Once the file has been examined and accepted, later runs start normally. A failure that will not reproduce the next morning is characteristic of this, and does not mean it was imagined.
- **It can affect several machines at the same time**, if they share a security policy and all download the same new browser version around the same time.

## What to do about it

**Exclude the Butler Sheet Icons browser cache directory from real-time scanning.** This is the directory Butler Sheet Icons downloads its browsers into:

| Platform | Directory |
|---|---|
| Windows | `C:\Users\<the account running Butler Sheet Icons>\.cache\puppeteer` |
| macOS and Linux | `~/.cache/puppeteer` |

Your security team will normally be the ones to make this change. It is a routine exclusion — the directory holds only browsers that Butler Sheet Icons downloaded itself from Google's official distribution point.

If an exclusion is not possible in your environment, the alternative is to avoid the first-sight scan happening during a scheduled run: after upgrading Butler Sheet Icons or changing the browser version, start a run by hand once and let it complete. The scan then happens while somebody is watching, rather than in the middle of the night.

## If the browser never starts at all

Where the wait ends in failure rather than success, the log says so directly:

```
error: QSEOW: The browser did not become ready within 30s. It was started but never reported
       a debugging endpoint - usually a browser build that cannot run on this machine, or
       security software holding it at startup.
```

This is the same family of problem, but with the browser failing rather than merely being slow. If the exclusion above does not resolve it, the browser version in use may be one that cannot run on this machine — see the page on choosing a browser version, and try the recommended version:

```
--browser-version recommended
```
