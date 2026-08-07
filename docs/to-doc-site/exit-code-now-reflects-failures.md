# Butler Sheet Icons now exits with a non-zero code when something fails

**Applies to:** every Butler Sheet Icons command

::: danger Action may be required — requires BSI 3.12.0 or later
If you run Butler Sheet Icons from a scheduled task, CI pipeline, or shell script, **this change can turn a job that always reported success into one that reports failure.** That is the intended behaviour, but read this page before upgrading so the change does not surprise you.
:::

## What changed

Until now, Butler Sheet Icons always exited with code 0 — the code that means "success" — no matter what happened. A run in which every single app failed to process finished with exactly the same exit code as a run in which everything worked. The only way to tell them apart was to read the log.

That made it impossible to build reliable automation around it. A scheduled job that checked the exit code was, in effect, checking nothing.

Butler Sheet Icons now exits with:

| Exit code | Meaning |
|---|---|
| `0` | The command completed and everything it was asked to do succeeded. |
| `1` | The command failed, or completed with one or more apps it could not process. |

## What now counts as a failure

- **Any app that could not be processed.** Other apps in the same run are still attempted — one bad app does not stop the rest — but the run as a whole reports failure at the end.
- **A connection that could not be established** to the Qlik Sense server or Qlik Sense Cloud tenant.
- **A selection that matched no apps at all** — for example a `--collectionid` that exists but contains no apps, or a `--qliksensetag` that no app carries. Previously this finished silently and reported success.
- **A Qlik Sense Cloud connection test that returns a response with no user in it.** This used to print `Connection to tenant … successful.` followed by four lines reading `undefined`, and the run then failed later for reasons that looked unrelated.

## New messages in the log

When apps fail, the run ends with a count:

```
CLOUD PROCESS APP: Failed to process app b: engine unreachable
Failed to process 1 of 3 app(s)
```

When the options matched no apps:

```
No apps to process. Check the --appid and --collectionid options.
```

On Qlik Sense Enterprise on Windows the hint names `--appid` and `--qliksensetag` instead.

When a Qlik Sense Cloud connection test cannot be read:

```
Connection test to tenant mytenant.eu.qlikcloud.com returned a response with no user in it. Check that --tenanturl points at a Qlik Sense Cloud tenant and that --apikey is a valid, unexpired API key for it.
```

## What to do before upgrading

**If you run Butler Sheet Icons interactively, there is nothing to do.** The change only affects the exit code, which you do not normally see.

**If you run it from automation, check what your job does with a non-zero exit code.** Most schedulers treat it as a failed job and may send an alert, stop a pipeline, or skip later steps.

1. Run your existing command by hand once after upgrading and check the exit code. On Linux and macOS:

   ```bash
   butler-sheet-icons qscloud create-sheet-thumbnails ... ; echo "exit code: $?"
   ```

   On Windows PowerShell, use `$LASTEXITCODE` instead of `$?`.

2. **If it returns 1, that is a real problem that was already happening** — it was simply invisible before. Read the log for the lines above and fix the underlying cause.

3. If you need the job to keep going for now while you investigate, most schedulers let you ignore the exit code of a step. Treat that as temporary: the exit code is telling you that sheet icons are not being updated the way you asked.

## What is still not covered

A sheet that could not be updated **within** an otherwise successful app does not by itself make the run report failure. Those failures are logged, but the exit code stays 0 if every app was otherwise processed. Per-sheet failure reporting is a separate change that has not shipped yet.
