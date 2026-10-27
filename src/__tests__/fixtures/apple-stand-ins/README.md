# Stand-ins for Apple's tools

`src/__tests__/macos-signing-kit.test.js` puts this folder first on `PATH`, and runs the macOS
signing kit against what is here: `scripts/sign-macos.sh` and its keychain library. It runs them
under `/bin/bash`, in a copy of the kit beside a stand-in binary.

Each stand-in appends the command line it was given to `$LOG`, does the least the kit needs, and
nothing else:

- **`security`** keeps the keychain search list in the file `$FAKE_KEYCHAINS`, one path a line. It
  prints the list the way the real one does, indented and quoted.
    - With `$FAKE_LIST_KEYCHAINS_FAILS` set, reading the list fails, as it does when `security` cannot
      reach securityd.
    - The default keychain is the login keychain, unless `$FAKE_DEFAULT_KEYCHAIN` names another.
      Writing it changes nothing.
- **`codesign`** signs nothing. While the file `$FAKE_CODESIGN_FAILURES` names holds a count above
  zero, a signing call fails instead and counts it down.
- **`ditto`** records the folder it was asked to zip, and each file in it with its mode. It leaves an
  empty file where the zip would be.
- **`xcrun notarytool submit`** answers with the status in `$FAKE_NOTARY_STATUS` (`Accepted` when
  unset), and exits 0 whatever that is. When `$FAKE_NOTARY_SLEEP` is set, it sleeps that many
  seconds first.
- **`plutil -extract`** reads a key from a flat JSON object.
- **`sleep`** returns at once, so that codesign's retries cost the tests nothing.

No real keychain, signature or notarization is involved. Apple's side is the signing canary's to
show (`.github/workflows/macos-signing-canary.yaml`).
