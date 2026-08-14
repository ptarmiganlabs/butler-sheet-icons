# The Windows download is digitally signed again

**Applies to:** the Windows download of Butler Sheet Icons. The macOS and Linux downloads, and the Docker image, are unaffected.

**Suggested target pages:** the troubleshooting page (a "Windows warns about the publisher" symptom), and wherever the site covers downloading and installing the Windows binary. This is a short addition to existing pages rather than a page of its own.

::: warning Requires Butler Sheet Icons 5.0.0 or later
5.0.0 is the first release to carry the restored signature. Earlier downloads are unaffected by
everything on this page.
:::

## What changed

From 5.0.0, Butler Sheet Icons' Windows executable carries a digital signature again. It is a
proper, commercial code signing certificate issued by Certum.

The certificate is issued to an individual open source developer rather than to a company, so the
publisher name Windows shows you is a person's name, not "Ptarmigan Labs". That is normal for open
source projects and does not affect what the signature guarantees. You can read the exact publisher
string out of any signed release yourself — see [Checking the signature
yourself](#checking-the-signature-yourself) below.

The previous certificate expired shortly before version 4.0.0, and the versions released in
between — **4.0.0 and 4.1.0** — shipped without any signature at all.

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
| Issuer | `CN=Certum Code Signing 2021 CA, O=Asseco Data Systems S.A., C=PL` |
| Thumbprint | `1674DF1C6EAD6DB9D816705CD230281B87A1C97E` |
| Valid | 2026-08-12 to 2027-08-12 |

The thumbprint is the value that actually confirms the publisher, and it is the one to compare. The
subject line — which names the individual the certificate was issued to — is printed by the commands
above from the release you already hold, so there is no need to reproduce it here.

None of this is confidential: the certificate is embedded in every signed release, so anyone holding
a download can read all of it out.

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
PUBLISHED to `next` on 2026-08-14, butler-sheet-icons-docs PR #98.

*** THE RELEASE-TIME CONDITION BELOW IS STILL OPEN. It could not be discharged at
*** publication because 5.0.0 has not been cut yet. Do NOT merge `next` to `main`
*** without it. See "THE ONE CONDITION" further down.

Published to:
  - reference/security.md - the Windows section (#windows-code-signing), previously a single
    sentence, now the full treatment
  - guide/installation.md - Windows platform notes, now version-qualified
  - guide/troubleshooting.md - new #windows-publisher-warning symptom table

The edit that set the 5.0.0 gate and removed the certificate holder's name was recovered from
an uncommitted working tree in the worktree .claude/worktrees/github-actions-failure-99713f
and committed as part of the archive. It had never been committed anywhere.

NOT VERIFIED AT PUBLICATION, and the highest-risk item on the page: the thumbprint, the issuer
string and the validity dates. WIN_CODESIGN_THUMBPRINT is a repository secret, so it is masked
in workflow logs and absent from the repo - there was no independent source to check against.
Those three values are the draft's own, from the 2026-08-12 signing-host run. Re-confirm them
as part of the release-time check.

What WAS verified independently: 4.1.0 shipped 2026-08-11 and the certificate was issued
2026-08-12, so no released version can carry it. The "4.0.0 and 4.1.0 unsigned, 5.0.0 first
signed" claim therefore holds without relying on the draft.

ALSO CORRECTED, already wrong on the live site: both reference/security.md and
guide/installation.md stated flatly that the Windows binary is signed, with no version
qualification. For anyone on 4.0.0 or 4.1.0 that was misleading - their download is unsigned
and the site gave them no way to know that was expected.

Original draft note follows.

---

Verified against the signing host on 2026-08-12 (scripts/diag/win-signing-check.ps1), and
re-confirmed on 2026-08-14 from the insiders-build log for main@5674fa8, which printed the
same subject and "Certificate valid until 2027-08-12":

  - The certificate is an individual open source developer certificate, NOT one issued to
    Ptarmigan Labs. An earlier draft of this page said Ptarmigan Labs throughout and was
    wrong.
  - Issuer is CN=Certum Code Signing 2021 CA, valid 2026-08-12 to 2027-08-12.

The certificate holder's name is deliberately NOT printed on this page. The doc site removed
it from the security page on 2026-08-13 (butler-sheet-icons-docs ded6c35, "docs: drop the
certificate holder's name from the Windows signing note"), and reinstating it here - with the
locality, no less - would undo that decision. Everything an administrator needs still works:
the thumbprint is what confirms the publisher, and the PowerShell snippets read the exact
subject out of the release they already hold. Do not add the subject back without checking
that the earlier decision has changed.

Resolved:

  - Version gate is 5.0.0, confirmed by the maintainer.
  - Unsigned versions are 4.0.0 and 4.1.0. 5.0.0 is signed.

THE ONE CONDITION: Windows signing can fail silently in a way that still produces a release.
On 2026-08-13 every insiders build was red for about 23 hours because the SimplySign session
had expired, and the signing precheck reported the certificate as usable anyway. This page
tells administrators the download is signed, so before `next` is merged to `main` at release
time, confirm the published 5.0.0 Windows binary really does carry a signature -
Get-AuthenticodeSignature on the actual release asset, not the CI log.

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
