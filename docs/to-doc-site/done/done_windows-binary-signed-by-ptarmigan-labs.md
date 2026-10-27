<!--
PUBLISHED 2026-10-27 to the doc site via ptarmiganlabs/butler-sheet-icons-docs#127 (into `next`;
production follows when `next` is next merged to the doc site's `main`). The version gate is
5.2.1, the first release signed through Azure Artifact Signing. It supersedes this draft's X.Y.Z
placeholder and its "6.0.0" guess.

Where it went:
- reference/security.md - the Windows section (#windows-code-signing) is rewritten. It covers
  who signed which release, what the signature does and does not do, how to check it
  (#checking-the-signature-yourself), the certificate table, and how to build an application
  control rule (#building-an-application-control-rule).
- guide/installation.md - the Windows bullets.
- guide/troubleshooting.md - #windows-publisher-warning gains a row for a publisher rule that
  stopped matching after an upgrade. The thumbprint advice is removed.

Changed on the way:
- The certificate details were re-checked against the 5.4.0 release's sign-win64 log: issued by
  AOC CA 03, under Code Signing PCA 2021. "About three days" became Microsoft's documented
  72 hours.
- One claim was not carried over: that a WDAC Publisher-level rule pairs the publisher with PCA
  2021. Which certificate such a rule anchors on depends on the chain embedded in the signature,
  and that was not checked against a release binary. The page points instead to Microsoft's
  documented durable identifier, the profile EKU starting 1.3.6.1.4.1.311.97.
-->

# The Windows download is now signed by Ptarmigan Labs AB

**Applies to:** the Windows download of Butler Sheet Icons. The macOS and Linux downloads, and the Docker image, are unaffected.

**Suggested target pages:** the section on the Windows signature that `done_windows-binary-signed-again.md` added (troubleshooting, and wherever the site covers downloading the Windows binary). This replaces that section's certificate details rather than adding a page of its own.

<!--
Do not publish until a release signed this way exists. Until then the newest Windows download is
still the Certum-signed one, and this page would tell administrators to expect a publisher that
download does not carry.

The certificate details below come from the signing rehearsal of 2026-10-18 (ci run
39107730794), which signed exactly as a release does and published nothing. Before publishing,
check them against the first release signed this way with the commands below, the issuing CA in
particular, and set the version gate from the release it shipped in. When this draft was written
the open release PR was for 6.0.0; do not trust that number either.
-->

::: warning Requires Butler Sheet Icons X.Y.Z or later
Earlier Windows downloads are signed with the previous certificate, or, for 4.0.0 and 4.1.0, not
at all.
:::

## What changed

The Windows executable is now signed with a certificate issued to **Ptarmigan Labs AB**, the company behind Butler Sheet Icons, through Microsoft's Azure Artifact Signing service. Windows shows the publisher as Ptarmigan Labs AB.

Earlier releases from 5.0.0 on were signed with a Certum certificate issued to an individual open source developer, so Windows showed a person's name as the publisher. That certificate is no longer used.

Nothing about how Butler Sheet Icons works has changed. This affects only how Windows identifies the file, and what an application control rule has to match.

## What you may need to do

**If you allow Butler Sheet Icons by publisher**, with AppLocker or Windows Defender Application Control, the rule written for the old certificate does not match the new one: the publisher, the issuer and the certificate are all different. Add a rule for the new publisher before you roll out the new version, or the new version is blocked where the old one ran.

**Do not allow it by certificate thumbprint.** Azure Artifact Signing issues short-lived certificates, valid for about three days and renewed automatically, so the thumbprint is different from one release to the next. A rule pinned to one thumbprint matches one release.

**Do not build the rule on the issuing CA either.** The certificate is issued by one of several Microsoft CAs (see the table below), and signings on the same day have already come from two different ones. Match on the publisher, Ptarmigan Labs AB, which stays the same. An AppLocker publisher rule matches on the publisher name. A Windows Defender Application Control rule at the Publisher level pairs the publisher with the CA one step below Microsoft's root, Microsoft ID Verified Code Signing PCA 2021, which also stays the same.

The signature itself stays valid after the certificate behind it expires. Every release is timestamped when it is signed, and Windows checks the certificate against that moment, not against today.

**If you allow it by file hash**, nothing changes: every release has a new hash anyway, as before.

**If you use insiders builds** (the test builds published for every change, not the releases): the Windows insiders build is not signed. It was usually unsigned before, too, and was signed only when a signing session happened to be open. Releases are always signed: if signing fails, the release goes out without a Windows download rather than with an unsigned one.

## Checking the signature yourself

In PowerShell, in the folder holding the executable:

```powershell
$sig = Get-AuthenticodeSignature -LiteralPath .\butler-sheet-icons.exe
$sig | Format-List Status, StatusMessage
$sig.SignerCertificate | Format-List Subject, Issuer, NotBefore, NotAfter
$sig.TimeStamperCertificate | Format-List Subject
```

You can also right-click the file, choose **Properties**, and look at the **Digital Signatures** tab.

`Status` should read `Valid`, and the subject should name **Ptarmigan Labs AB**. `Valid` alone only means some trusted certificate signed the file; the publisher name is what says it was us.

| | |
|---|---|
| Issued to (publisher) | `Ptarmigan Labs AB` |
| Issued by | One of Microsoft's ID Verified issuing CAs. Signings so far: `Microsoft ID Verified CS AOC CA 03` and `Microsoft ID Verified CS EOC CA 03`, so a release may show either, or another |
| Above that | `Microsoft ID Verified Code Signing PCA 2021`, under `Microsoft Identity Verification Root Certificate Authority 2020` |
| Timestamped by | `Microsoft Public RSA Time Stamping Authority` |
| Certificate lifetime | About three days. A new certificate, and a new thumbprint, for each release |

`NotAfter` will usually be a date close to the release, and may well be in the past by the time you check. That is expected, and `Status` still reads `Valid`, because of the timestamp.

## SmartScreen

Microsoft Defender SmartScreen may still warn about a new release:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognised app from starting.

SmartScreen warns based on the reputation a publisher and a file have built up, not merely on whether a signature exists, and a newly published file has none yet. Choose **More info**, check that the publisher reads Ptarmigan Labs AB, then **Run anyway**.
