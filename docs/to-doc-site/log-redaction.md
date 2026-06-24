# Secret redaction in logs

Butler Sheet Icons automatically removes passwords, API keys, tokens, and other sensitive values from log output. This is on by default, requires no setup, and applies to every log message written during a run — including log messages emitted by third-party libraries, stack traces from unhandled errors, and crash dump files.

This page explains what is redacted, where the redaction happens, and what to do if you ever need to look at a redacted value while troubleshooting.

## What is redacted?

Two kinds of redaction run together. Both are best-effort and run automatically.

### Property names that are always redacted

When Butler Sheet Icons logs an options object — for example, the full command-line options passed to `qseow create-sheet-thumbnails` — any property whose name is in the secret allow-list is replaced with `***redacted***` before the object is written to the log.

The allow-list covers the property names most likely to contain a credential, including (case-insensitive):

- `logonpwd`
- `apikey`, `apiKey`, `api_key`
- `password`, `pwd`, `passwd`
- `passphrase`
- `secret`, `token`
- `authorization`
- `accessKey`, `access_key`
- `clientSecret`, `client_secret`
- `BSI_CLOUD_API_KEY`, `BSI_QSEOW_CST_LOGON_PWD`, `BSI_QSEOW_CST_CERT_FILE`, `BSI_QSEOW_CST_CERTKEY_FILE`

If you add a new option that carries a credential, add the property name to the allow-list in the source code so it is redacted on the next run.

### Patterns that are always redacted in text

The redaction also matches common patterns in free text, so log messages and stack traces that mention secrets in passing are cleaned up as well. The text `***[REDACTED]***` is substituted for the matched value. The following patterns are recognised:

- **URLs with embedded credentials** — `https://user:secret@host/...` becomes `https://[REDACTED]@host/...`
- **Authorization headers** — `Authorization: Bearer eyJhbGciOi…` becomes `Authorization: Bearer [REDACTED]`. The same applies to `Basic …` and `Token …` schemes.
- **`key=value` and `key:value` patterns** — `password=hunter2`, `api_key=abcdef`, `clientSecret: topsecret`, and similar. Recognised key names are the same as the property-name allow-list above.
- **JSON-style quoted secrets** — `"password": "mysecret"` becomes `"password": "[REDACTED]"`.

## Where does the redaction happen?

The redaction is implemented in two places:

1. **In the logging pipeline.** Every log line that goes through the Winston logger is run through a redaction step before it is written to the console. This means secrets are redacted even if a third-party library tries to log them.
2. **In crash dump files.** Crash dump files are written with the same redaction applied, so the text contents of any error message or stack trace captured in a crash dump is also cleaned up before the file is written to disk.

In both places, the redaction runs on the message text after your code has produced it. It cannot look inside encrypted blobs or pull secrets out of binary attachments.

## What does redacted output look like?

### Before

```
BSI.CORE 2026-06-24 10:30:45 debug: Options: {
  "host": "qlik.example.com",
  "engineport": 4747,
  "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def",
  "logonpwd": "hunter2",
  "tenanturl": "https://tenant.eu.qlikcloud.com"
}
```

### After

```
BSI.CORE 2026-06-24 10:30:45 debug: Options: {
  "host": "qlik.example.com",
  "engineport": 4747,
  "apikey": "***redacted***",
  "logonpwd": "***redacted***",
  "tenanturl": "https://tenant.eu.qlikcloud.com"
}
```

The non-secret properties are preserved as-is so the logs remain useful for troubleshooting. The `tenanturl` is left intact because it is a host name, not a credential.

## What if I need to see a redacted value?

There is no off switch for redaction. This is by design: silently disabling redaction in production is exactly the kind of mistake that leaks credentials into shared log files.

If you are troubleshooting a problem and the redacted value is what you need, the right approach is to look at the value in its original source — for example, the environment variable, the command-line flag, or the certificate file. Run Butler Sheet Icons with `--loglevel debug` to see the full log message; the surrounding non-secret fields will still be visible, which is usually enough to confirm the option was passed in correctly.

If you find yourself wanting to log a specific property that should be visible in debug output, that is a sign the property should not be on the secret allow-list. In that case, raise an issue describing the use case rather than disabling redaction.

## What if the redaction is too aggressive?

If the redaction is matching text that is not actually a secret (for example, a long random-looking string that happens to look like a bearer token), please open an issue with the log line and a description of the false positive. The patterns are tuned to be conservative, but a balance has to be struck between false positives and false negatives.

## What is the difference between secret redaction in logs and in crash dumps?

Log redaction and crash dump redaction are the same code path. Both apply the same patterns and the same property allow-list. A crash dump file is safe to share with the same care you would take with a log file: the redaction makes accidental disclosure much less likely, but it is not a guarantee. Always read the file before sharing it.

## Related

- [Crash dump files](./crash-dump-files.md) — what is in a crash dump, where the files are written, and how to share them with support.
- [Node runtime flags for SEA builds](../sea-runtime-flags.md) — how to set `BSI_LOG_LEVEL` and other environment variables on Windows, macOS, and Linux.
