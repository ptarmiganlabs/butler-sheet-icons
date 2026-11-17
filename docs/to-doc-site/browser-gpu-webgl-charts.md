# Charts drawn with WebGL show an error in thumbnails: `--browser-gpu`

Some Qlik Sense charts draw with **WebGL**, the browser's interface to the graphics card. One
example is the Network.qs extension. Butler Sheet Icons starts its browser with the graphics card
turned off, and without it the browser offers no WebGL. Such a chart then draws its own error
message, and the thumbnail shows that message instead of the chart. The same sheet looks fine in a
user's browser.

A new option, `--browser-gpu`, lets the browser use the graphics card. Where there is none, the
browser draws WebGL in software instead. It is off by default, so a run of the Windows, macOS or
Linux program that does not turn it on behaves as before. **The Docker image is the exception**: it
now draws WebGL charts in software whether or not the option is set. See "In the Docker image" below.

<!--
Verification status (2026-11-17), issue #1235:
- Measured on macOS (Apple M4 Max, Chrome for Testing 151, the build BSI uses by default), headless
  and with --headless false, with and without --single-process:
  - default (--disable-gpu): no WebGL and no WebGL 2, in every mode.
  - --browser-gpu true: WebGL 2 on "ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max ...)", in every mode.
  - browser check reports both correctly, exit code 0 in all cases.
- Measured in the Docker image (Alpine, Chromium 156, no GPU, arm64 on the build Mac):
  - Before this change the image had no SwiftShader: no WebGL with any flags, --browser-gpu true included.
  - Göran chose (2026-11-17) to add Alpine's chromium-swiftshader package. The image grows by 28.7 MB
    uncompressed. With it, WebGL 2 is drawn in software with OR WITHOUT --browser-gpu: Alpine's Chromium
    does not hold software WebGL back the way Chrome for Testing does. browser check says "yes, in
    software" both ways.
  - Live, default settings (no --browser-gpu), --pagewait 10: 8 of 8 sheets captured, exit 0. Seven
    sheets drawn completely. The sheet with two large Network.qs charts showed "Loading the network
    5,000 of 7,912 edges" in both charts. The same sheet with --pagewait 30 was drawn completely.
  - SwiftShader's licence (Apache 2.0) is on chrome://credits in the image; Alpine records the
    package as BSD-3-Clause. The image's licence notice says both.
  - The amd64 image, built locally under emulation on the build Mac (the release workflow is the
    only one that builds the image): chromium-swiftshader installed, browser check says "yes, in
    software" on SwiftShader with and without --browser-gpu, exit 0. No thumbnail run on amd64
    hardware.
- NOT verified:
  - Windows, with or without a GPU.
  - Linux outside Docker with the Chrome BSI downloads. Chrome for Testing has no linux-arm64 build, so it
    could not be measured on the build Mac.
  Check these before publishing anything that depends on them.
- Live on the QSEoW lab (qs-2605-cn01), Network.qs channels app 1bc4634a-..., 8 sheets, headless,
  --browser-gpu true, --pagewait 10, macOS, from source:
  - Every sheet with a Network.qs chart was captured WITH the network drawn: no "cannot draw the
    network" notice. The app overview captured after the run shows all eight new thumbnails.
  - With the GPU on AND --single-process (which BSI adds on macOS and Linux outside Docker), two full
    8-sheet runs both hung at sheet 3 on Page.captureScreenshot (the 180 s protocol timeout). Sheet 3
    alone captured fine. Why is not known.
  - So --browser-gpu now also leaves --single-process out. With that: three full runs, 24 of 24
    sheets captured, exit 0 - headless twice, --headless false once. Internal only; nothing for the
    published page to say about it, unless a reader asks why the verbose log says so.
- Version: set the version gate from the open release-please PR at publishing time. Do not guess one.
-->

## Proposed changes

| Page                                      | Change                                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/guide/troubleshooting`                  | New symptom: "A chart shows an error message in the thumbnail but draws fine in Qlik Sense". Cause and fix as below.                            |
| `/guide/concepts/browser-management`      | Short section "The graphics card is off by default", linking to the troubleshooting entry and the reference pages.                              |
| `/reference/qseow`, `/reference/qscloud`  | Regenerate the option tables (`npm run docs:cli-tables`). `--browser-gpu` appears in both. Add a sentence linking to the troubleshooting entry. |
| `/reference/browser`, `/reference/doctor` | Regenerate the option tables, and describe the new "WebGL 2" row of the launch test (below).                                                    |
| `/guide/advanced/docker`                  | A section on WebGL charts in the image, from "In the Docker image" below. Mention it in the release notes too: the image's default changed.     |
| `/guide/concepts/environment-variables`   | Add `BSI_BROWSER_GPU` to the list of variables shared by every command, next to `BSI_BROWSER_CACHE_DIR`.                                        |

## What you see

- A thumbnail shows a chart's own error message where the chart should be. Network.qs, for example,
  says that the browser cannot draw the network because it does not offer WebGL 2.
- The sheet draws normally when a user opens it in Qlik Sense.
- The run reports success. From Butler Sheet Icons' side nothing failed: the sheet was opened and
  captured. It was only drawn without the graphics card.

This happens with and without `--headless false`. A visible browser window has the graphics card
turned off too.

## Why the graphics card is off by default

Butler Sheet Icons usually runs on a server, often a virtual machine or a container. A graphics
driver on such a machine is a common cause of browser crashes and hangs, and most sheets don't
need the graphics card at all. So the browser starts without it unless you ask otherwise.

## Turning it on

Add `--browser-gpu true` to the command that creates thumbnails. On Qlik Sense Enterprise on Windows:

::: code-group

```powershell [PowerShell]
.\butler-sheet-icons.exe qseow create-sheet-thumbnails --host sense.company.com --appid <app-id> --browser-gpu true
```

```bash [Bash]
./butler-sheet-icons qseow create-sheet-thumbnails --host sense.company.com --appid <app-id> --browser-gpu true
```

:::

The same option exists on `qscloud create-sheet-thumbnails`, `browser check` and `doctor check`.

You can also set the environment variable `BSI_BROWSER_GPU=true`. **It is one variable for all four
commands**, not one per command like `BSI_QSEOW_CST_HEADLESS`. Whether the browser may use the
graphics card is a setting for the machine, and `browser check` must start the browser the same way
the real run will. `BSI_BROWSER_CACHE_DIR` works the same way.

`true`, `yes`, `on` and `1` turn it on. `false`, `no`, `off`, `0` and an empty value leave it off.
On the command line, `--browser-gpu` on its own also means on.

When it is on, the plan printed at the start of a run says so on the `browser` row: `GPU on`.

## What the option does

- **On a machine with a graphics card**, the browser uses it. WebGL charts draw as they do for a user.
- **On a machine without one**, as on most servers and in containers, the browser draws WebGL in
  software, with a component called SwiftShader. The charts appear correctly, but take longer to draw.
  If a chart is not finished when the thumbnail is taken, raise `--pagewait`.

Chrome calls software WebGL "unsafe". The word is about websites nobody has vetted: drawing their
WebGL in software gives an attacker more to work with. Butler Sheet Icons opens only your own Qlik
Sense server, and whatever its sheets and extensions load, so this is a much smaller concern here
than in a browser used for the web. It is still a reason not to turn the option on where no sheet
needs it.

## Checking before a run

`browser check` now reports whether the browser can draw WebGL 2, in its launch test. Run it with
the same setting the real run will use:

::: code-group

```powershell [PowerShell]
.\butler-sheet-icons.exe browser check --browser-gpu true
```

```bash [Bash]
./butler-sheet-icons browser check --browser-gpu true
```

:::

The `WebGL 2` row says one of these:

| `WebGL 2` row                      | Meaning                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `yes`                              | Drawn on the graphics card. The next row, `WebGL renderer`, names it.                                                                            |
| `yes, in software`                 | Drawn by SwiftShader or another software renderer. Charts will appear, more slowly.                                                              |
| `no - GPU off, see --browser-gpu`  | The default. Charts drawn with WebGL will show an error. Turn the option on if a sheet needs it.                                                 |
| `no, although --browser-gpu is on` | Printed with a warning. The browser offers no WebGL even in software. A Linux distribution's Chromium may need SwiftShader installed separately. |
| `not checked`                      | Printed with a warning. The browser started, but could not be asked.                                                                             |

None of these changes the result or the exit code of `browser check` or `doctor check`. A run
without WebGL still writes every thumbnail; only the charts that need WebGL come out wrong.

For scripts, the findings are `BSI-BROWSER-024` (on a graphics card), `025` (in software), `026`
(off), `027` (on, but none) and `028` (not checked).

## In the Docker image

The Docker image has no graphics card to use, so it draws WebGL in software. It includes
SwiftShader for that, and its browser uses it **by default**: charts drawn with WebGL appear in
thumbnails without `--browser-gpu` or `BSI_BROWSER_GPU`. Setting them changes nothing visible in a
container.

::: warning Changed in BSI X.Y.Z
Earlier images could not draw WebGL at all: such charts showed their error message in every
thumbnail. If you relied on that, for example to keep a heavy chart out of thumbnails, exclude the
sheet with `--exclude-sheet-number` or `--exclude-sheet-tag` instead.
:::

Drawing in software is slower than on a graphics card. A sheet with large network charts may not be
finished after the default wait of 5 seconds, and its thumbnail then shows the chart part-way, for
Network.qs a "Loading the network" message. Raise `--pagewait` until the charts are complete. On the
Butler Sheet Icons test server, a sheet with two Network.qs charts of about 8,000 and 9,000 links
needed more than 10 seconds and was complete at 30.

`browser check` inside the container says `WebGL 2: yes, in software`.
