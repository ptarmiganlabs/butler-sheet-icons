# The Windows binary is temporarily unsigned

**Applies to:** the Windows download of Butler Sheet Icons. The macOS and Linux downloads, and the Docker image, are unaffected.

::: warning Affects BSI 4.0.0 and later, until further notice
The Windows executable is not currently digitally signed. Windows will warn you when you run it, and some managed environments will refuse to run it at all.
:::

## What changed

Butler Sheet Icons' Windows executable used to carry a digital signature identifying Ptarmigan Labs as its publisher. That code signing certificate has expired, and a replacement is being arranged.

Rather than hold Windows releases back until it arrives, the binary now ships unsigned. Everything about how it works is unchanged — this affects only how Windows treats the file, not what Butler Sheet Icons does.

## What you will see

**Downloading.** Some browsers warn that the file "isn't commonly downloaded" and may ask you to confirm before keeping it.

**Running it the first time.** Microsoft Defender SmartScreen shows a blue dialog:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognised app from starting.

To continue, choose **More info**, then **Run anyway**. You may need to do this once per new version.

**Unblocking the file.** If Windows keeps treating the download as untrusted, you can clear the download marker in PowerShell:

```powershell
Unblock-File -Path .\butler-sheet-icons.exe
```

**Antivirus.** Butler Sheet Icons is a single-file executable built from the Node.js runtime, and that construction is a common source of antivirus false positives. A signature previously helped suppress those. Without it, your antivirus may quarantine the file. If that happens, and you obtained the file from the official release page, you can add an exclusion for it — or use one of the alternatives below.

## If your environment blocks unsigned applications

Many organisations enforce application control through AppLocker or Windows Defender Application Control, often allowing programs by publisher certificate. **An unsigned executable cannot be permitted by a publisher rule and will not run**, and there is no way for you as a user to override that.

If that describes your environment, you have two options that avoid the problem entirely:

- **Use the Docker image.** `ptarmiganlabs/butler-sheet-icons` is unaffected by Windows code signing, and it is the better fit for locked-down and air-gapped servers regardless. It also carries a browser inside the image, so nothing needs downloading at run time.
- **Ask your Windows administrator for a file hash rule.** Application control policies can permit a specific executable by its hash rather than by publisher. This has to be repeated for each new version, which is why publisher rules are usually preferred — but it works.

## Making sure you have the genuine file

Download only from the official release page:

<https://github.com/ptarmiganlabs/butler-sheet-icons/releases>

Files offered anywhere else are not published by Ptarmigan Labs, and without a signature there is nothing in the file itself that proves where it came from.

## When will signing return

A replacement certificate is being obtained. When it is in place, Windows releases will be signed again and this page will be withdrawn. No change on your side will be needed — simply download the newer release.

The macOS binary continues to be signed and notarized by Apple throughout, and Linux releases are distributed as archives, where code signing is not customary.

<!--
NOT PUBLISHED.

Retired without publishing on 2026-08-10. scripts/release-win.ps1 has two live
`signtool sign` calls and none commented out, so the Windows release binary is
signed again and this draft would have told users the opposite. The live doc
site never carried the claim, so there was nothing to correct.

CORRECTION, 2026-08-12: the reasoning above was wrong, though retiring the page
was still the right call.

The two `signtool sign` calls were live but *guarded* - release-win.ps1 skipped
signing whenever CODESIGN_WIN_THUMBPRINT was empty, and ci.yaml had that variable
commented out. So Windows releases were still shipping unsigned when this note
claimed they were signed again, and 4.1.0 went out unsigned after it was written.
Reading a script for commented-out lines says nothing about whether the code runs;
what decided it was the workflow that supplies the variable.

The page stayed unpublished throughout, so no reader was ever misled. Signing was
restored with a new Certum certificate; the successor draft is
docs/to-doc-site/windows-binary-signed-again.md, which covers 4.0.0 and 4.1.0
having been unsigned and so replaces the need for this one.
-->
