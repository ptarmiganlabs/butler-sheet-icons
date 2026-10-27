# Apple certificate authorities, for the signing keychain

These are two public Apple CA certificates. They carry no secret: a CA certificate is the public
half by definition, and Apple publishes both at the URLs below. Nothing here is a credential.

| File                          | Subject                                                        | Expires    |
| ----------------------------- | -------------------------------------------------------------- | ---------- |
| `DeveloperIDG2CA.cer`         | `CN=Developer ID Certification Authority, OU=G2, O=Apple Inc.` | 2031-09-17 |
| `AppleIncRootCertificate.cer` | `CN=Apple Root CA, O=Apple Inc.`                               | 2035-02-09 |

```text
sha256(DeveloperIDG2CA.cer)         = f16cd3c54c7f83cea4bf1a3e6a0819c8aaa8e4a1528fd144715f350643d2df3a
sha256(AppleIncRootCertificate.cer) = b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024
```

Sources: <https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer> and
<https://www.apple.com/appleca/AppleIncRootCertificate.cer>.

## Why they are needed

`codesign` has to build the whole chain, from the signing identity up to a self-signed root. The
`.p12` in `MACOS_CERTIFICATE` holds the Developer ID leaf and its private key, and nothing above
them.

GitHub's hosted macOS images ship Apple's intermediates, so the gap is invisible while signing
happens there. A Mac that lacks them fails at once, with codesign reporting `unable to build chain to
self-signed root` and then `errSecInternalComponent`. That includes a self-hosted runner, and a
maintainer's own machine.

## Why they are committed rather than fetched

`scripts/lib/macos-signing-keychain.sh` imports both into the throwaway signing keychain on every
signing run. Nothing is installed on the machine itself. Committing them has two effects:

- a release does not depend on apple.com being reachable at the moment it is cut;
- the signing keychain is self-contained, so the Mac needs no preparation.

Before this folder existed, `scripts/insider-build-mac.sh` downloaded the intermediate on every
build, and `scripts/release-macos.sh` relied on the runner image having it.

`.gitattributes` marks `*.cer` as binary. They are DER, and the repository otherwise treats every
file as text.

## Checking and renewing them

```bash
shasum -a 256 release-config/apple-ca/*.cer
openssl x509 -inform DER -in release-config/apple-ca/DeveloperIDG2CA.cer -noout -subject -enddate
```

Replace the intermediate from Apple's URL before it expires, and update its hash above.
