> **Archived 2026-08-17.** Published into `/reference/log-redaction` (butler-sheet-icons-docs
> PR #101, `next` branch): the quoted-value pattern joined the recognised-patterns list, the
> "one shape is not redacted" subsection follows it, and the `doctor check` JSON report was added
> to the list of places redaction runs. Published essentially as drafted.

# Log redaction now covers quoted passwords

**Target page:** the existing `Log redaction` reference page, which lists the patterns Butler Sheet
Icons recognises. This draft adds one entry to that list and one short subsection below it. The rest
of the page is unchanged.

**Audience:** a Qlik Sense administrator who reads Butler Sheet Icons log files, or who is about to
attach one to a support request.

---

## What changed

Butler Sheet Icons strips credentials out of its log files and crash dumps before writing them. It
already recognised the `password=secret` and `"password": "secret"` shapes. It now also recognises a
**quoted** value given to a password or key setting:

```
--logonpwd "my long pass phrase"     ->  --logonpwd "[REDACTED]"
logonpwd="my long pass phrase"       ->  logonpwd="[REDACTED]"
```

This matters because quoting is the only reason to use a password containing spaces, and the
previous rules stopped at the opening quote — so exactly the passwords that needed hiding were the
ones left in full.

## Add to the list of recognised patterns

Alongside the existing entries on that page:

| Pattern | Example | Becomes |
| --- | --- | --- |
| A quoted value after a password or key setting | `--logonpwd "my pass phrase"` | `--logonpwd "[REDACTED]"` |

The setting names covered are the same ones the other rules use: `logonpwd`, `password`, `passwd`,
`pwd`, `secret`, `token`, `apikey` / `api_key`, `apitoken` / `api_token`, `accesskey` / `access_key`,
`auth`, `passphrase` and `clientsecret` / `client_secret`.

## What is deliberately not covered

Add this as a short subsection, because being straight about the limit is what makes the rest of the
page trustworthy.

> ### One shape is not redacted
>
> A password given **without quotes**, as a separate word — `--logonpwd mypassword` — is **not**
> removed from free text by these rules.
>
> There is no way to tell that apart from ordinary prose. `--logonpwd mypassword` and
> `Use --apikey instead.` are the same shape to a pattern matcher, so a rule that hides the first
> also deletes the word "instead" from the second. Butler Sheet Icons has been through that once
> already: an earlier version removed the useful word from its own error messages, which is worse
> than useless when you are trying to work out what went wrong.
>
> **In practice this does not expose your password**, because Butler Sheet Icons never writes your
> command line to the log. Settings are redacted by *name* — anything called `logonpwd` or `apikey`
> is replaced whatever it contains — which is reliable in a way pattern matching is not. The
> interactive wizard does the same when it prints the command line for you to reuse.
>
> The one thing to be aware of: if you paste your own command line into a support request or a
> GitHub issue, **check it yourself first**. Butler Sheet Icons did not write that text and has not
> seen it.

## Note for the `doctor check` page

The JSON document produced by `doctor check --outputformat json` goes through the same redaction, so
the same limit applies to it. The existing wording on that page — "give the document a read before
you attach it to a public issue" — is still correct and needs no change.
