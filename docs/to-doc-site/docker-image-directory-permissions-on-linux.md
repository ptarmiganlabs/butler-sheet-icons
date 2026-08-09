# Fixed: the Docker image can now write thumbnails to a mounted folder on Linux

**Applies to:** the Butler Sheet Icons Docker image, on Linux hosts. Any command given a `--imagedir` that points at a mounted folder — in practice `create-sheet-thumbnails` for both Qlik Sense Enterprise on Windows and Qlik Sense Cloud.

::: warning Requires BSI 3.12.0 or later
In earlier versions, running the Docker image on a Linux host and mounting a folder for the thumbnails failed for **every** app in the run.
:::

## Summary

The documented way to get thumbnails out of the container is to mount a folder from the host:

```bash
docker run -it --rm \
  -v "$HOME/bsi-bsi/img:/nodeapp/img" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qseow create-sheet-thumbnails \
  --imagedir ./img \
  ...
```

On a Linux host this did not work. Butler Sheet Icons runs inside the container as a dedicated, unprivileged account, and that account was not the owner of the folder you mounted — your own account was. The container therefore had no permission to create anything in it, and the run failed before a single thumbnail was produced.

The container now looks at who owns the folder you mounted and runs as that user, so it can write there. **Nothing about your command changes.** The examples in this documentation, and any scripts you already have, work as they always should have.

As a bonus, the thumbnails now belong to *you* on the host rather than to an account that exists only inside the container, so you can open, move and delete them without needing elevated rights.

## Why this only affected Linux

Docker Desktop on macOS and Windows quietly ignores file ownership on mounted folders — anything in the container can write to them regardless. Docker on Linux does not, and neither do other Linux container runtimes.

That difference is why the problem went unnoticed for so long: the same command that worked perfectly on a laptop failed on a Linux server, which is exactly where scheduled and automated runs live.

## How to tell if this affected you

The run failed for every app, and the log contained an error like:

```
error: EACCES: permission denied, mkdir './img/cloud/6ab8a5b7-1f0e-4e9c-8b53-9f42b6c1a0d2'
error: CLOUD PROCESS APP: Failed to process app 6ab8a5b7-1f0e-4e9c-8b53-9f42b6c1a0d2: Error creating cloud image directory
```

Search your logs for `EACCES`. On Qlik Sense Enterprise on Windows the wording differs slightly — `QSEOW CREATE THUMBNAILS 1` in place of `CLOUD PROCESS APP`, and `qseow` in place of `cloud` in the folder path — but `EACCES` appears either way.

A **certificate** problem on Qlik Sense Enterprise on Windows had the same underlying cause and is fixed by the same change. If you mounted a folder holding `client.pem` and `client_key.pem` and saw:

```
error: QSEOW CREATE THUMBNAILS 2: Missing certificate file(s)
```

even though the files were plainly there, this is why. Certificate files are normally readable only by their owner, and the container was not running as that owner.

If you saw either error, upgrade and re-run. No change to your command is needed.

## If the run still cannot write

Two situations are left where the container cannot adapt on its own. Both now produce an explanation in the log instead of a bare permission error.

**The mounted folder is owned by `root`.** Butler Sheet Icons deliberately does not take on root's identity to get around this — running a web browser and processing untrusted content as root is not a trade worth making. Mount a folder you own instead:

```bash
mkdir -p "$HOME/bsi-bsi/img"
```

**You started the container with an explicit `--user`.** That instruction is respected as given, so it is then up to you to make sure the account you named can write to the folder:

```bash
docker run -it --rm \
  --user "$(id -u):$(id -g)" \
  -v "$HOME/bsi-bsi/img:/nodeapp/img" \
  ...
```

This form is fully supported and is the right choice where a security policy requires the container's user to be fixed in advance. It also now works correctly for the persistent browser cache, which it did not in earlier versions.

**The folder is mounted read-only.** A mount ending in `:ro` cannot be written to by anyone. Remove the flag for the folder that receives thumbnails.

## What you will see in the log

When the container adapts to the folder's owner, it says so once, before anything else:

```
butler-sheet-icons: running as uid 1000:1000, adopted from /nodeapp/img, so files written there belong to you
```

If that line is absent, the container is running as its own built-in account — which is correct and expected when you have not mounted anything, or when the mounted folder already belongs to that account.
