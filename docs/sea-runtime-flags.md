# Node Runtime Flags for SEA builds

Standalone Butler Sheet Icons binaries are packaged with Node.js single executable applications (SEA). When you append tracing flags such as `--trace-warnings`, `--trace-deprecation`, or `--trace-uncaught` to the Butler Sheet Icons command line, the CLI automatically restarts itself once with those flags added to `NODE_OPTIONS`. This mirrors the behaviour you get when running `node --trace-warnings ./src/butler-sheet-icons.js ...` in a local development checkout.

```powershell
butler-sheet-icons --trace-warnings qseow create-sheet-thumbnails `
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

Butler Sheet Icons automatically suppresses known Node.js deprecation warnings that originate from bundled third-party dependencies when running as a SEA binary. These warnings are filtered at runtime to keep console output clean while still maintaining visibility for debugging.

### Default behavior

- **SEA binaries**: Deprecation warnings are suppressed by default
- **Node.js execution**: Deprecation warnings are shown by default (e.g., `node src/butler-sheet-icons.js`)

### Suppressed deprecation codes

The following Node.js deprecation codes are currently suppressed:

- `DEP0005`: `Buffer()` constructor deprecation (use `Buffer.alloc()`, `Buffer.allocUnsafe()`, or `Buffer.from()` instead)
- `DEP0169`: `url.parse()` deprecation (use WHATWG URL API instead)

Additional codes can be added to the `SUPPRESSED_DEPRECATION_CODES` array in `src/globals.js` as needed.

### Viewing suppressed warnings

Suppressed warnings are logged at the `debug` level. To see them during development or troubleshooting, use:

```bash
# View suppressed deprecation warnings
butler-sheet-icons browser install --loglevel debug
```

### Environment variable override

Use the `BSI_SUPPRESS_DEPRECATIONS` environment variable to override default behavior:

- `BSI_SUPPRESS_DEPRECATIONS=1` or `true`: Force suppression even for Node.js execution
- `BSI_SUPPRESS_DEPRECATIONS=0` or `false`: Disable suppression even for SEA binaries

**macOS / Linux:**

```bash
# Disable suppression in SEA binary to see all warnings
BSI_SUPPRESS_DEPRECATIONS=0 ./build/butler-sheet-icons browser install

# Enable suppression for Node.js execution
BSI_SUPPRESS_DEPRECATIONS=1 node src/butler-sheet-icons.js browser install
```

**Windows PowerShell:**

```powershell
# Disable suppression
$env:BSI_SUPPRESS_DEPRECATIONS = "0"
.\build\butler-sheet-icons.exe browser install

# Enable suppression
$env:BSI_SUPPRESS_DEPRECATIONS = "1"
node src/butler-sheet-icons.js browser install
```

### Technical details

When suppression is active:

- `process.noProcessWarnings = true` prevents Node.js from printing warnings directly to stderr
- A custom `process.on('warning')` handler intercepts all Node.js warnings
- Deprecation warnings matching suppressed codes are logged at `debug` level with full details (name, code, message, stack)
- Non-suppressed warnings are forwarded to the logger at `warn` level
