# Node Runtime Flags for SEA builds

Standalone Butler Sheet Icons binaries are packaged with Node.js single executable applications (SEA). When you append tracing flags such as `--trace-warnings`, `--trace-deprecation`, or `--trace-uncaught` to the Butler Sheet Icons command line, the CLI automatically restarts itself once with those flags added to `NODE_OPTIONS`. This mirrors the behaviour you get when running `node --trace-warnings ./src/butler-sheet-icons.js ...` in a local development checkout.

```powershell
butler-sheet-icons --trace-warnings qseow create-sheet-thumbnails \
  --host your-server --appid your-app-id ...
```

## Setting `NODE_OPTIONS`

You can also control the runtime flags explicitly via `NODE_OPTIONS`. The CLI will merge values passed via the environment variable with any flags specified directly on the command line.

### macOS / Linux (bash, zsh)

```bash
# One-off command
NODE_OPTIONS="--trace-warnings --trace-deprecation" \
  butler-sheet-icons qseow create-sheet-thumbnails ...

# Persist for the session
export NODE_OPTIONS="--trace-warnings --trace-deprecation"
butler-sheet-icons qseow create-sheet-thumbnails ...
```

### Windows PowerShell

```powershell
# Apply for the current PowerShell session
$env:NODE_OPTIONS = "--trace-warnings --trace-deprecation"
butler-sheet-icons qseow create-sheet-thumbnails ...

# Clear when you are done
Remove-Item Env:NODE_OPTIONS
```

### Windows Command Prompt (cmd.exe)

```cmd
set "NODE_OPTIONS=--trace-warnings --trace-deprecation"
butler-sheet-icons qseow create-sheet-thumbnails ...
set NODE_OPTIONS=
```

> Tip: Combine `NODE_OPTIONS` with `--loglevel debug` when troubleshooting SEA binaries so you capture both high-level logs and Node stack traces.

## Deprecation warnings

Known Node.js deprecation warnings originating from third-party dependencies are suppressed automatically when Butler Sheet Icons runs as a SEA binary. Set `BSI_SUPPRESS_DEPRECATIONS=0` in the environment to surface every warning again, or `BSI_SUPPRESS_DEPRECATIONS=1` to force suppression for non-SEA runs.
