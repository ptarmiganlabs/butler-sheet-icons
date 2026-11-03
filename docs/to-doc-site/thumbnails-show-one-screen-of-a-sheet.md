# Thumbnails show one screen of a sheet: extended sheets lose their lower part

A sheet's thumbnail shows what fits on one screen. Butler Sheet Icons opens every sheet in a browser window of a fixed size and captures what is visible there. A Qlik Sense sheet that has been **extended**, made taller than the screen so that it scrolls, therefore gets a thumbnail showing only its top part. For a sheet extended once, that is the top two-thirds.

This is not the browser being zoomed, and it is not a setting in Butler Sheet Icons. The doc site never explains it. One page even points to sizing tips that do not exist. This draft proposes changes to three pages.

<!--
Verification status (2026-11-03):
- Verified live on QSEoW 2026-May (qs-2605-cn01). Eight sheets were extended once (150%), and all were captured with
  --includesheetpart 1. Each capture is 1230 x 681 pixels. On a 12-row sheet it shows grid rows 1-8,
  exactly 100/150 of the sheet. Nothing is zoomed. The browser viewport is set to 1230 x 810 at device scale 1
  in both the QSEoW and Qlik Cloud code, and that size has not changed since February 2022.
- NOT verified live:
  - Parts 2-4 on an extended sheet. The code captures every part within the same 1230 x 810 window, and part 4
    captures elsewhere measure 1230 x 810.
  - Qlik Sense Cloud: the test tenant was expired. It has the same window size and captures the same element for part 1.
  Check both before publishing.
- Images are never resized: no resize call exists anywhere in the source. Every capture also gets a blurred copy,
  created unconditionally on both platforms, and both are uploaded: a 4-sheet app uploads 8 files.
-->

## Proposed changes

| Page                           | Change                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `/guide/concepts/sheet-parts`  | New section, "What fits in a thumbnail". Replace the note about small browser windows.    |
| `/guide/troubleshooting`       | New entry under "Sheet-Specific Issues": "The thumbnail shows only the top of the sheet". |
| `/guide/concepts/how-it-works` | Correct two claims: images are not resized, and the blurred copy is not optional.         |

Cross-link the sheet parts section and the troubleshooting entry both ways. Link "How it works" to the new section.

---

## 1. `/guide/concepts/sheet-parts`: new section "What fits in a thumbnail"

Suggested anchor: `{#what-fits-in-a-thumbnail}`. Place it after "When to use each option".

> ### What fits in a thumbnail {#what-fits-in-a-thumbnail}
>
> Butler Sheet Icons opens each sheet in a browser window that is always **1230 × 810 pixels**. That is large enough for the picture to stay sharp when Qlik Sense shrinks it to thumbnail size. The window size is fixed: no option changes it, and the page is not zoomed.
>
> `--includesheetpart` chooses which part of that window becomes the thumbnail. Value `4` is the whole window, and values `1` to `3` are smaller areas inside it. Whichever you choose, the thumbnail shows what is on screen. Anything a user would have to scroll down to see is not in it.
>
> #### Extended sheets
>
> Qlik Sense lets a sheet be taller than the screen. You switch on **Extend sheet** under **Sheet properties**, and each extension adds 50% of the sheet's original height. The sheet then scrolls vertically.
>
> Butler Sheet Icons captures the sheet as it first opens, scrolled to the top. An extended sheet's thumbnail therefore shows only its upper part:
>
> | The sheet is…           | The thumbnail shows… |
> | ----------------------- | -------------------- |
> | Not extended            | The whole sheet      |
> | Extended once (150%)    | The top two-thirds   |
> | Extended twice (200%)   | The top half         |
> | Extended 3 times (250%) | The top two-fifths   |
>
> ::: tip A sheet can be extended without anyone meaning to
> Dropping an object on the drop zone at the bottom of a sheet also extends the sheet. If thumbnails look cut off, check the sheet even if nobody remembers switching **Extend sheet** on.
> :::
>
> To get the whole sheet into its thumbnail, the sheet has to fit on one screen, which means not extended. Otherwise, place whatever makes the sheet recognisable near the top. A thumbnail is there to help users find a sheet, not to show every chart on it.
>
> This applies to both Qlik Sense Enterprise on Windows and Qlik Sense Cloud.
>
> Qlik's own help describes extending sheets in the section "Extending the sheet area". For Qlik Sense Enterprise on Windows see [Structuring an app using sheets](https://help.qlik.com/en-US/sense/May2026/Subsystems/Hub/Content/Sense_Hub/Sheets/create-sheets-for-structure.htm). For Qlik Sense Cloud see [Changing sheet layouts](https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Sheets/changing-sheet-layout.htm).
>
> If a thumbnail is missing the bottom of its sheet, see [The thumbnail shows only the top of the sheet](/guide/troubleshooting#thumbnail-shows-only-the-top-of-the-sheet).

### Replace the note on the same page

Under "When to use each option", the current text reads:

> - Very small browser windows can affect cropping; see Browser Management for sizing tips.

Replace it with:

> - The browser window is always 1230 × 810 pixels, and an extended sheet shows only its top part. See [What fits in a thumbnail](#what-fits-in-a-thumbnail).

Why: Browser Management has no sizing tips, and the window size cannot be changed. The current note points readers at an option that does not exist.

---

## 2. `/guide/troubleshooting`: new entry under "Sheet-Specific Issues"

> ### The thumbnail shows only the top of the sheet {#thumbnail-shows-only-the-top-of-the-sheet}
>
> **What you see:** charts near the bottom of a sheet are missing from its thumbnail. The thumbnail looks cut off partway down the sheet, while the other sheets in the app look complete.
>
> **Why:** the sheet is extended, so it is taller than one screen. Butler Sheet Icons captures the sheet in a browser window of fixed size, scrolled to the top, so only the part that fits on the first screen is captured. A sheet extended once loses its bottom third. Nothing is zoomed or scaled, and Butler Sheet Icons has no option to capture more.
>
> **How to check:** open the sheet in Qlik Sense. If it scrolls vertically, it is extended. In edit mode, **Sheet properties** shows **Extend sheet** switched on.
>
> **What to do:**
>
> - If the sheet does not need the extra height, make it fit on one screen. The next run then captures all of it.
> - Otherwise, put the content that identifies the sheet near the top.
> - Choosing a larger sheet part with `--includesheetpart` does not help. Every part is taken from the same window.
>
> See [What fits in a thumbnail](/guide/concepts/sheet-parts#what-fits-in-a-thumbnail).

---

## 3. `/guide/concepts/how-it-works`: correct two claims

**The Mermaid diagram** has a step `G --> H[Process & Resize Image]`, followed by `H --> I[Create Blurred Version]`. Butler Sheet Icons never resizes an image. It uploads the capture at the size it was taken, and Qlik Sense scales it down when it displays it. Suggested change: drop the `Process & Resize Image` node and connect `G` straight to `I[Create Blurred Version]`.

**Step 5 of "What happens at each step"** currently reads:

> 1. Process images — Resizes to thumbnail and optionally produces a blurred variant for sensitive content. Details in [Sheet blurring](/guide/concepts/sheet-blurring).

Both halves are wrong. There is no resizing, and the blurred copy is not optional: one is made for every captured sheet, and both images are uploaded. The blurring rules only decide which of the two a sheet ends up using. Suggested replacement:

> 1. Process images — Makes a blurred copy of every capture. The blurring rules decide which of the two a sheet ends up with; see [Sheet blurring](/guide/concepts/sheet-blurring). Images are uploaded at the size they were captured, and Qlik Sense scales them down for display. What a capture contains is described in [What fits in a thumbnail](/guide/concepts/sheet-parts#what-fits-in-a-thumbnail).
