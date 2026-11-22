# Sheet thumbnails now match the shape the hub shows them in

**Target page:** the page that describes `create-sheet-thumbnails` and `--includesheetpart` (both QSEoW and Qlik Cloud). Suggested as a section headed "Thumbnail size and shape".

## What changed

The Qlik Sense hub, on both Qlik Sense Enterprise on Windows and Qlik Cloud, shows every sheet thumbnail in a box with a fixed 3:2 shape: 150 × 100 pixels in the app overview, and a little larger in the sheet navigator inside a sheet. An image of any other shape is **stretched** to fill that box, not scaled to fit.

Earlier versions of Butler Sheet Icons captured images that were wider than 3:2. How much wider depended on the platform and on the sheet part you chose, for example 1230 × 681 on QSEoW and 1230 × 473 on a Qlik Cloud tenant with `--includesheetpart 1`. In the hub this squeezed the thumbnails sideways: text looked narrow and circles became ellipses.

Butler Sheet Icons now captures every sheet thumbnail at 3:2, so the hub shows it without distortion. With the default browser window this means images of **1230 × 820 pixels** for any sheet part that spans the width of the window, which the sheet parts normally do.

There is nothing to configure. Run `create-sheet-thumbnails` again to replace thumbnails made by an earlier version.

## How it works

Butler Sheet Icons opens the first sheet of each app, measures the part of the sheet it is about to capture, and makes the browser window taller or shorter until that part is 3:2. The window then keeps that size for the rest of the app's sheets. The image is never cropped or padded: what you see in the thumbnail is the sheet as Qlik Sense lays it out at that window size.

Because the window can become taller than before, a sheet part may show a little more of the sheet than it used to, for example a few more table rows.

## The dry-run plan

The `images` line of the plan, shown at the start of a run and by `--dry-run`, now states the shape and size of the images:

```text
  images        ./img/qseow/<app-id>   3:2, 1230x820 for a full-width sheet part
```

## If a thumbnail cannot be made 3:2

If the captured part of a sheet does not change height when the browser window does, Butler Sheet Icons cannot make it 3:2. It then captures the part as it is and logs a warning like this one:

```text
QSEOW APP: The captured sheet part (--includesheetpart 1) is 1230x500, not 3:2, even after resizing the browser window, so its height does not follow the window. It is captured as it is, and the hub will stretch it to fit its 3:2 thumbnail box.
```

The run continues and the thumbnail is still uploaded; only its shape is off. If you see this warning, try another value of `--includesheetpart`. `--includesheetpart 4`, the whole sheet, follows the window on both platforms.
