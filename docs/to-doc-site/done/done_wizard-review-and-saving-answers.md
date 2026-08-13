# Seeing what will happen, and keeping your answers

Two additions to interactive mode: a clearer picture before anything runs, and the option to keep your answers so you never have to give them again.

## Before anything runs

The wizard now shows a table of what it is about to do, followed by the equivalent command line:

```
── Review ──────────────────────────────────────

┌──────────────────┬──────────────────────────────────────┐
│ tenanturl        │ acme.eu.qlikcloud.com                │
│ apikey           │ <hidden>                             │
│ includesheetpart │ 2                                    │
│ appid            │ 3 selected:                          │
│                  │ a1b2c3d4-1111-2222-3333-4444555566…  │
└──────────────────┴──────────────────────────────────────┘

  Equivalent command:
  butler-sheet-icons qscloud create-sheet-thumbnails --tenanturl acme.eu…

? Ready?
❯ Run it
  Start over
  Save the answers to .env
  Cancel
```

The table shows only what the run will actually use. Options left at their default are not listed — if a row is not there, the default applies. Credentials are never shown, in the table or the command line.

On a terminal that cannot draw box characters, such as some Windows consoles, the table is drawn with `+` and `-` instead. Nothing is lost.

## Saving your answers

Choosing **Save the answers to .env** writes a `.env` file in the directory you are running from:

```
# Butler Sheet Icons
# Settings for: butler-sheet-icons qscloud create-sheet-thumbnails

BSI_QSCLOUD_CST_TENANTURL=acme.eu.qlikcloud.com
BSI_QSCLOUD_CST_APIKEY=<set this yourself>
BSI_QSCLOUD_CST_APP_ID=app-a,app-b
```

Butler Sheet Icons reads `.env` automatically on the next run from that directory, so the same command can then be repeated with no options at all — which is what makes this useful for a scheduled task.

Saving does not end the wizard. You come back to the review, so you can save *and* run.

### It updates, it does not replace

If a `.env` file is already there, only the settings belonging to the command you just ran are changed. Everything else — settings for other Butler Sheet Icons commands, comments, anything you put there yourself — is left exactly as it was, byte for byte.

You are told what will change before it happens:

```
/home/goran/.env already exists. 6 setting(s) belonging to this command will be
updated or added; everything else in the file is left untouched. A copy is kept
in .env.bak either way.

? Update .env? (Y/n)
```

A setting already in the file is updated in place. One that is not there is added at the end. A copy of the file as it was is kept in **`.env.bak`**, so even an unwanted update is recoverable — note that `.env.bak` is replaced on each save, so it always holds the version immediately before the most recent one.

### Credentials are a separate decision

You are asked once more before any password or API key is written:

```
? Also write the credentials to the file? (y/N)
```

Answering **no**, the default, writes everything else and leaves a `<set this yourself>` placeholder where the credential goes. Answering **yes** writes them and restricts the file so only your user account can read it.

Think about this one. A credential in a file is a credential that can be copied, backed up or committed by accident. `.env` is already listed in Butler Sheet Icons' own `.gitignore`, but that does not help if you keep your settings somewhere else. Supplying credentials as environment variables at run time, rather than storing them, is the safer habit.

## After the run

The wizard now says plainly whether the run succeeded:

```
✔ Done
```

or, if something went wrong:

```
✖ The run reported a failure - the log above says which apps and why
```

Per-app detail stays in the log above, which already names each app it processed and each one that failed.
