# Naming several apps in one run

`--appid` used to accept exactly one app. If you wanted thumbnails for three named apps you had to
run Butler Sheet Icons three times, or put a tag on all three in Qlik Sense first.

It now accepts as many as you like:

```bash
butler-sheet-icons qseow create-sheet-thumbnails \
  --appid a1b2c3d4-1111-2222-3333-444455556666 \
  9f8e7d6c-aaaa-bbbb-cccc-ddddeeeeffff \
  --host sense.acme.com \
  ...
```

Commas work too, which is usually easier to read and easier to paste:

```bash
--appid a1b2c3d4-1111-2222-3333-444455556666,9f8e7d6c-aaaa-bbbb-cccc-ddddeeeeffff
```

Both forms are accepted everywhere, including in the environment variable:

```bash
export BSI_QSEOW_CST_APP_ID=a1b2c3d4-1111-2222-3333-444455556666,9f8e7d6c-aaaa-bbbb-cccc-ddddeeeeffff
```

This applies to `qseow create-sheet-thumbnails`, `qscloud create-sheet-thumbnails` and
`qscloud remove-sheet-icons`.

## Combining with tags and collections

`--appid` and `--qliksensetag` (or `--collectionid` on Qlik Sense Cloud) are **added together**,
not chosen between. This is how Butler Sheet Icons has always behaved, but the built-in help
previously suggested otherwise.

So this processes every app carrying the `Butler Sheet Icons` tag, **plus** the one named
explicitly:

```bash
butler-sheet-icons qseow create-sheet-thumbnails \
  --qliksensetag "Butler Sheet Icons" \
  --appid a1b2c3d4-1111-2222-3333-444455556666 \
  ...
```

An app that is both named by `--appid` and carries the tag is still processed **once**. You can
see exactly which apps were selected by running with `--loglevel debug`, which lists them before
any work starts:

```
debug: Will process these app IDs:
debug: a1b2c3d4-1111-2222-3333-444455556666
debug: 9f8e7d6c-aaaa-bbbb-cccc-ddddeeeeffff
```

## Nothing changes for existing commands

A single `--appid <id>` behaves exactly as it always has, so existing scripts, scheduled tasks
and container runs need no changes. Every other option and message is unchanged; the only visible
difference is the `--appid` entry in `--help`.

One detail worth knowing if you drive Butler Sheet Icons from a systemd unit file or a Docker
environment file: a variable that is *set but empty* — a bare `BSI_QSEOW_CST_APP_ID=` line —
counts as no app being named, rather than as one app with a blank id.
