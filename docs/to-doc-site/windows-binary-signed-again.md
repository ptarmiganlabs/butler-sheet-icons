# The Windows download is digitally signed again

**Applies to:** the Windows download of Butler Sheet Icons. The macOS and Linux downloads, and the Docker image, are unaffected.

**Suggested target pages:** the troubleshooting page (a "Windows warns about the publisher" symptom), and wherever the site covers downloading and installing the Windows binary. This is a short addition to existing pages rather than a page of its own.

::: warning Version gate to be filled in at publication
The version that first carries the restored signature is not yet decided — it is whatever release ships after this change. Set the gate before publishing; do not guess it.
:::

## What changed

Butler Sheet Icons' Windows executable carries a digital signature again. The certificate is issued by Certum to the project's maintainer as an open source developer, so the publisher shown by Windows is:

> **Open Source Developer Karl Göran Sander**

That is the name on the certificate rather than a company name, which is normal for open source projects and does not affect what the signature guarantees.

The previous certificate expired shortly before version 4.0.0, and the versions released in between — **4.0.0 and 4.1.0** — shipped without any signature at all.

Nothing about how Butler Sheet Icons works has changed. This affects only how Windows treats the file.

## What the signature does for you

**It proves where the file came from.** A valid signature confirms the executable was published by the holder of that certificate and has not been altered since — by a mirror, a proxy, or anything else between the release page and your server.

**Publisher rules work again.** Many organisations enforce application control through AppLocker or Windows Defender Application Control, commonly allowing programs by publisher certificate. Those rules can match the signed release, where they could not match the unsigned 4.0.0 and 4.1.0 downloads at all — an unsigned executable cannot be permitted by a publisher rule under any configuration.

If your Windows administrator created a file hash rule to allow an unsigned version, it is worth asking them to replace it with a publisher rule. A hash rule has to be updated for every new release; a publisher rule does not.

**Antivirus false positives become less likely.** Butler Sheet Icons is a single-file executable built from the Node.js runtime, and that construction is a common source of false positives. A valid signature helps, though it does not guarantee anything — if your antivirus still quarantines the file and you obtained it from the official release page, add an exclusion.

## What the signature does not do

**It does not immediately silence Microsoft Defender SmartScreen.**

SmartScreen decides whether to warn based on the *reputation* it has accumulated for a file and its signing certificate, not merely on whether a signature exists. Only Extended Validation certificates receive reputation immediately; this is a standard code signing certificate, so reputation builds as more people download the release.

In practice that means you may still see:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognised app from starting.

especially in the first weeks after a new certificate is put into use. Choose **More info**, then **Run anyway**. The warning should become less frequent over time, and unlike an unsigned file, you can now confirm who published it before you proceed.

## Checking the signature yourself

Worth doing if you are deploying into a controlled environment, or confirming a download before distributing it internally. In PowerShell, in the folder holding the executable:

```powershell
$sig = Get-AuthenticodeSignature -LiteralPath .\butler-sheet-icons.exe
$sig | Format-List Status, StatusMessage
$sig.SignerCertificate | Format-List Subject, Issuer, Thumbprint, NotAfter
```

You can also right-click the file, choose **Properties**, and look at the **Digital Signatures** tab.

### Check the thumbprint, not only the status

`Status` reading `Valid` means the file carries an intact signature from a certificate Windows trusts. It does **not** mean the file came from us — any correctly signed program on earth passes that test. Comparing the thumbprint is what actually confirms the publisher.

| | |
|---|---|
| Subject | `CN=Open Source Developer Karl Göran Sander, O=Open Source Developer, L=Saltsjö-Duvnäs, S=Stockholm, C=SE` |
| Issuer | `CN=Certum Code Signing 2021 CA, O=Asseco Data Systems S.A., C=PL` |
| Thumbprint | `1674DF1C6EAD6DB9D816705CD230281B87A1C97E` |
| Valid | 2026-08-12 to 2027-08-12 |

None of this is confidential. The certificate is embedded in every signed release, so anyone holding a download can read it out; publishing it here only saves you the step.

Two things that surprise people:

- **The thumbprint is a SHA-1 hash _of the certificate_**, which has nothing to do with the SHA-256 digest used for the signature itself. Windows has identified certificates this way for years. It is not a weakness in the signature.
- **A renewal changes the thumbprint.** Releases signed before 2026-08-12 carry an older certificate, and releases after 2027-08-12 will carry its replacement. If the thumbprint does not match, check this page before assuming the worst.

### Building an application control rule

If you allow programs by publisher through AppLocker or Windows Defender Application Control, you can build the rule from the publisher certificate rather than from a specific binary. Export it from any signed release:

```powershell
$sig = Get-AuthenticodeSignature -LiteralPath .\butler-sheet-icons.exe
[System.IO.File]::WriteAllBytes("$PWD\butler-sheet-icons-publisher.cer", $sig.SignerCertificate.RawData)
```

That `.cer` file is what `Add-SignerRule` expects when adding a signer to a WDAC policy. Prefer this to a file hash rule: a publisher rule keeps working across releases, while a hash rule has to be updated for every new version.

One point worth understanding: **the signature is timestamped**. It therefore stays valid after the signing certificate itself expires, so a release downloaded years from now still verifies. Without a timestamp, every previously released binary would stop validating the day the certificate lapsed.

A valid signature proves the publisher, not the download source. Always download from the official release page:

<https://github.com/ptarmiganlabs/butler-sheet-icons/releases>

## Still on an unsigned version

If you are running 4.0.0 or 4.1.0, upgrading to the current release is the fix. No configuration change is needed on your side — download the newer release as usual.

<!--
DRAFT - do not publish until a signed release actually exists.

Verified against the signing host on 2026-08-12 (scripts/diag/win-signing-check.ps1):

  - Publisher name is "Open Source Developer Karl Göran Sander", NOT "Ptarmigan Labs".
    An earlier draft of this page said Ptarmigan Labs throughout and was wrong. The
    certificate is an individual open source developer certificate, subject
    CN=Open Source Developer Karl Göran Sander, O=Open Source Developer,
    L=Saltsjö-Duvnäs, S=Stockholm, C=SE.
  - Issuer is CN=Certum Code Signing 2021 CA, valid 2026-08-12 to 2027-08-12.

Still to confirm before publishing:

  - The list of unsigned versions. 4.0.0 and 4.1.0 are unsigned. Whether any later
    release is also unsigned depends on when this change ships - check the releases
    page and update.
  - Set the version gate at the top.
  - Re-check the certificate table against the live certificate. The thumbprint in it
    was read off the signing host on 2026-08-12 and matches the WIN_CODESIGN_THUMBPRINT
    secret; confirm both still agree at publication.

MAINTENANCE, and the reason this page is not fire-and-forget: it publishes the
certificate thumbprint, so it goes stale the moment the certificate is renewed - due
2027-08-12. A wrong thumbprint on this page is worse than no thumbprint, because the
whole point of the section is telling administrators to distrust a binary whose
thumbprint does not match. Renewing the certificate means updating this page in the
same pass as the WIN_CODESIGN_THUMBPRINT secret.

The certificate details are deliberately public. The certificate is embedded in every
signed binary, so nothing here is disclosed that a release download does not already
carry - which is also why the page can tell administrators to export it from a release
rather than asking us for a file.

The SmartScreen section deliberately does NOT promise the warning disappears. This is a
standard certificate, not EV, so it earns reputation over time rather than receiving it
on day one. Telling admins the warning is gone and having it appear anyway would cost
more trust than saying nothing.
-->
