# BSI_SUPPRESS_DEPRECATIONS

`BSI_SUPPRESS_DEPRECATIONS` controls whether Butler Sheet Icons forwards Node.js runtime warnings that originate from bundled third-party dependencies (for example `proxy-from-env`, `pend`, or Puppeteer). These warnings appear most often when running the SEA-packaged binary because everything is bundled into a single executable.

## Default behaviour

| Runtime                            | Default                      | Notes                                                                                                                                               |
| ---------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEA binary                         | `true` (warnings suppressed) | SEA builds inline several dependencies that emit unavoidable Node deprecation warnings. Suppressing them prevents noisy log output during CLI runs. |
| `node ./src/butler-sheet-icons.js` | `false`                      | In development the warnings are allowed so contributors can spot regressions quickly.                                                               |

## Overrides

The variable accepts truthy/falsey string values:

- `BSI_SUPPRESS_DEPRECATIONS=1`
- `BSI_SUPPRESS_DEPRECATIONS=true`
- `BSI_SUPPRESS_DEPRECATIONS=0`
- `BSI_SUPPRESS_DEPRECATIONS=false`

Anything else falls back to the default behaviour for the current runtime.

## Usage examples

### Temporarily show warnings when running the SEA binary

```bash
BSI_SUPPRESS_DEPRECATIONS=0 ./butler-sheet-icons ...
```

### Silence warnings during local development

```bash
BSI_SUPPRESS_DEPRECATIONS=1 node ./src/butler-sheet-icons.js ...
```

## What gets suppressed?

Currently the CLI filters the following Node.js deprecation codes/messages because they originate inside upstream packages we do not control:

- `DEP0169` (`url.parse()` behaviour)
- `DEP0005` (`Buffer()` constructor)
- `DEP0190` (`child_process.spawn` with `shell: true`)

All other warnings continue to flow through the standard logger so unexpected issues remain visible.
