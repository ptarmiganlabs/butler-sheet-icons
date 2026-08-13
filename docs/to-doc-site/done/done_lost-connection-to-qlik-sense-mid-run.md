<!--
PUBLISHED 2026-08-13 to the doc site `next` branch, PR ptarmiganlabs/butler-sheet-icons-docs#87,
as a section in guide/troubleshooting.md under Network Issues.

TWO CLAIMS BELOW WERE NOT PUBLISHED AS WRITTEN:

1. "Consider a shorter --pagewait if your sheets render quickly. It shortens the time the
   connection spends idle per sheet." This is pre-keep-alive reasoning. The keep-alive pings every
   20 s regardless of how long the gap is, so shortening --pagewait buys nothing against an idle
   drop and costs thumbnails of half-drawn charts. Published as a warning AGAINST doing it.

2. The draft says the keep-alive makes drops "far less likely" but never says what it does not do.
   socket-keepalive.js is explicit: nothing retries a session that has already gone. The published
   page says so, because "less likely to happen" invites the opposite assumption.

Also published here, not with the Windows auth material: the 4.1.0 "closed from the other end,
code 1000" correction, which done_windows-run-fails-with-invalid-auth-credentials.md listed as one
of its three version-dependent items.

Everything else -- both log lines, the 20 s interval, the 25-40 s screenshot gap, both platforms
with Cloud benefiting most -- verified verbatim.
-->

# When the connection to Qlik Sense drops in the middle of a run

Butler Sheet Icons holds one connection to the Qlik Sense engine open for as long as it is working on an app. If that connection is lost part-way through — the app has ten sheets and the connection dies at sheet three — the run cannot finish that app.

This draft covers a change to **how such a drop is reported**, and a change that makes it **less likely to happen** in the first place. It belongs with the troubleshooting material, alongside the existing pages on connecting to Qlik Sense Cloud and to Qlik Sense Enterprise on Windows.

Nothing here needs configuring. There are no new options.

## What the log used to say

A dropped connection was reported once per remaining sheet, as though each sheet were individually at fault:

```
error: CLOUD APP: Failed to create a thumbnail for sheet 3 ('Sales overview', ID 5e93a5a8-…) in app 5838acc6-…: Not connected
error: CLOUD APP: Failed to create a thumbnail for sheet 4 ('Regional split', ID e507b7f4-…) in app 5838acc6-…: Not connected
error: CLOUD APP: Failed to create a thumbnail for sheet 5 …: Not connected
error: CLOUD APP: Failed to create a thumbnail for sheet 6 …: Not connected
error: CLOUD APP: Failed to create a thumbnail for sheet 7 …: Not connected
error: CLOUD PROCESS APP: Failed to process app 5838acc6-…: Failed to create a thumbnail for 5 of 6 sheet(s)
```

Read literally, that says five sheets are broken. They are not — there is nothing wrong with any of them. One connection was lost, and every sheet after it was reported as a casualty. On an app with forty sheets this filled the log with dozens of identical lines and a summary blaming the sheets.

## What the log says now

The run stops working on that app as soon as the connection is gone, and says so once:

```
warning: CLOUD PROCESS APP: The engine session to Qlik Sense Cloud tenant your-tenant.eu.qlikcloud.com
         was closed from the other end, code 1006. Whatever is still using this session will fail
         from here on.
error:   CLOUD APP: Lost the engine session while processing app 5838acc6-… at sheet 3, abandoning
         the remaining sheets: Not connected (websocket closed with code 1006)
```

(Both lines are shown wrapped here; each is a single line in the log. The prefix at the start of each line names the stage the run was in, and differs between commands.)

Three things are worth knowing about this output:

- **The `warning` line appears at the moment the connection drops**, which can be up to a minute before anything fails. Taking a screenshot of a sheet is slow, and Butler Sheet Icons does not talk to the engine while it is waiting for the browser. The connection can therefore be gone for some time before the next request discovers it.
- **The number after `code` is the reason the connection ended**, as reported by the network layer. `1006` means the connection ended without a proper goodbye — typically a network device, firewall or proxy somewhere between Butler Sheet Icons and Qlik Sense dropping it. Other codes indicate the Qlik Sense end closed it deliberately, and usually come with a reason in the message. **If you report this problem, please include this line** — it is the single most useful piece of information for diagnosing it.
- **Sheets after the failure point are no longer listed as failures.** They were never attempted.

## What happens to the app

The same as before, stated more clearly:

- Sheets whose thumbnails were already produced **are** uploaded and applied.
- The remaining sheets **keep the icons they already had**. Nothing is blanked or replaced with a broken image.
- The app is reported as failed, and the run ends with a non-zero exit code. A scheduled task will show it as failed.

Re-running Butler Sheet Icons for that app is safe and is the right response.

## Making it less likely

Butler Sheet Icons now sends a small "still here" signal on the Qlik Sense connection every 20 seconds while it is otherwise idle.

The reason is that taking a screenshot of one sheet takes 25–40 seconds, and during that time the connection to Qlik Sense carries no traffic at all. Network equipment commonly closes connections it believes have been abandoned, and a connection that has been silent for half a minute looks abandoned. Keeping a little traffic on it makes that far less likely.

This applies to both Qlik Sense Cloud and Qlik Sense Enterprise on Windows, needs no configuration, and is not something you will see in the log. Connections to Qlik Sense Cloud benefit most, as they cross the public internet rather than your own network.

## If it keeps happening

A run that loses its connection occasionally, and succeeds on a re-run, is a network hiccup — annoying, not a misconfiguration.

If it happens repeatedly, the close code in the log is the place to start:

- **Code 1006, repeatedly** — something on the network path is closing the connection. A firewall, proxy or VPN with an idle-connection timeout is the usual culprit. Ask whoever manages it whether long-lived WebSocket connections to Qlik Sense are being timed out.
- **Any other code, usually with a reason** — the Qlik Sense end closed the connection on purpose. The reason text is the thing to investigate, and is worth including in a support request.
- **Consider a shorter `--pagewait`** if your sheets render quickly. It shortens the time the connection spends idle per sheet. Do not shorten it past what your sheets need to finish rendering, or the thumbnails will show half-drawn charts.
