# Docker Testing Commands

Use these one-liners to exercise the Butler Sheet Icons Docker image the same way you already test the native binaries. Commands are grouped by platform (macOS bash and Windows PowerShell) and mirror the existing native workflows.

> **Image tag:** `ptarmiganlabs/butler-sheet-icons:latest` (adjust if you test another tag)

## Prerequisites

- Docker Desktop or another Docker runtime that can run Linux containers.
- Native Docker is assumed to work on both macOS and Windows. On Windows, Docker Desktop with the default Linux VM/WSL2 backend works best (Windows containers are still untested per `README.md`).
- Required environment variables (for QS Cloud/QSEoW) must already be exported in the host shell.
  - macOS bash uses `$BSI_*` (for example `$BSI_CLOUD_TENANT_URL`).
  - Windows PowerShell uses `$env:BSI_*`.
- Host folders:
  - `img`: receives generated screenshots.
  - `cert`: holds `client.pem` and `client_key.pem` exported from QSEoW.
  - `browser-cache`: optional but keeps the Puppeteer cache persistent across runs.

## Prepare Host Folders

Create these directories once per machine. Copy your QSEoW certificate files into the `cert` folder after it exists.

### macOS bash

```bash
mkdir -p "$HOME/bsi-bsi/img" "$HOME/bsi-bsi/cert" "$HOME/bsi-browser-cache"
# Copy certificates into place (adjust source paths):
cp /path/to/client.pem "$HOME/bsi-bsi/cert/"
cp /path/to/client_key.pem "$HOME/bsi-bsi/cert/"
```

### Windows PowerShell

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\bsi-bsi\img" | Out-Null
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\bsi-bsi\cert" | Out-Null
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\bsi-browser-cache" | Out-Null
# Copy certificates into place (adjust source paths):
Copy-Item -Path C:\path\to\client.pem -Destination "$env:USERPROFILE\bsi-bsi\cert"
Copy-Item -Path C:\path\to\client_key.pem -Destination "$env:USERPROFILE\bsi-bsi\cert"
```

## Shared Mount Conventions

These commands rely on two shared patterns:

| Host Path (macOS) | Host Path (Windows) | Container Path | Purpose |
| --- | --- | --- | --- |
| `$HOME/bsi-bsi/img` | `$(Resolve-Path $HOME\bsi-bsi\img)` | `/nodeapp/img` | Screenshot output |
| `$HOME/bsi-bsi/cert` | `$(Resolve-Path $HOME\bsi-bsi\cert)` | `/nodeapp/cert` | QSEoW TLS material |
| `$HOME/bsi-browser-cache` | `$(Resolve-Path $HOME\bsi-browser-cache)` | `/home/nodejs/.cache/puppeteer` | Browser cache |

Feel free to change the host paths—just update the mount arguments accordingly.

---

## Browser Cache Commands

### macOS bash

```bash
# List available browsers in the Puppeteer cache
docker run -it --rm \
  -v "$HOME/bsi-browser-cache:/home/nodejs/.cache/puppeteer" \
  ptarmiganlabs/butler-sheet-icons:latest \
  browser list-available

# Uninstall every cached browser build
docker run -it --rm \
  -v "$HOME/bsi-browser-cache:/home/nodejs/.cache/puppeteer" \
  ptarmiganlabs/butler-sheet-icons:latest \
  browser uninstall-all
```

### Windows PowerShell

```powershell
# List available browsers in the Puppeteer cache
docker run -it --rm \
  -v "$(Resolve-Path $env:USERPROFILE\bsi-browser-cache):/home/nodejs/.cache/puppeteer" \
  ptarmiganlabs/butler-sheet-icons:latest \
  browser list-available

# Uninstall every cached browser build
docker run -it --rm \
  -v "$(Resolve-Path $env:USERPROFILE\bsi-browser-cache):/home/nodejs/.cache/puppeteer" \
  ptarmiganlabs/butler-sheet-icons:latest \
  browser uninstall-all
```

---

## QS Cloud Commands

### List Collections

macOS bash:
```bash
docker run -it --rm \
  ptarmiganlabs/butler-sheet-icons:latest \
  qscloud list-collections \
  --tenanturl "$BSI_CLOUD_TENANT_URL" \
  --apikey "$BSI_CLOUD_API_KEY" \
  --outputformat table
```

Windows PowerShell:
```powershell
docker run -it --rm \
  ptarmiganlabs/butler-sheet-icons:latest \
  qscloud list-collections \
  --tenanturl $env:BSI_CLOUD_TENANT_URL \
  --apikey $env:BSI_CLOUD_API_KEY \
  --outputformat table
```

### Create Sheet Thumbnails

macOS bash:
```bash
docker run -it --rm \
  -v "$HOME/bsi-bsi/img:/nodeapp/img" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qscloud create-sheet-thumbnails \
  --tenanturl "$BSI_CLOUD_TENANT_URL" \
  --apikey "$BSI_CLOUD_API_KEY" \
  --logonuserid "$BSI_CLOUD_LOGON_USERID" \
  --logonpwd "$BSI_CLOUD_LOGON_PWD" \
  --appid "$BSI_CLOUD_APP_ID" \
  --log-level verbose \
  --imagedir ./img
```

Windows PowerShell:
```powershell
docker run -it --rm \
  -v "$(Resolve-Path $env:USERPROFILE\bsi-bsi\img):/nodeapp/img" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qscloud create-sheet-thumbnails \
  --tenanturl $env:BSI_CLOUD_TENANT_URL \
  --apikey $env:BSI_CLOUD_API_KEY \
  --logonuserid $env:BSI_CLOUD_LOGON_USERID \
  --logonpwd $env:BSI_CLOUD_LOGON_PWD \
  --appid $env:BSI_CLOUD_APP_ID \
  --log-level verbose \
  --imagedir ./img
```

> Add other options (collections, sheet filters, blur settings) exactly as you would with the native CLI.

---

## QSEoW Command

Mount both the image output and certificate directories. The command below mirrors the previously shared native example, including the emoji tag.

### macOS bash

```bash
docker run -it --rm \
  -v "$HOME/bsi-bsi/img:/nodeapp/img" \
  -v "$HOME/bsi-bsi/cert:/nodeapp/cert" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qseow create-sheet-thumbnails \
  --host "$BSI_HOST" \
  --appid "a3e0f5d2-000a-464f-998d-33d333b175d7" \
  --apiuserdir Internal \
  --apiuserid sa_api \
  --loglevel info \
  --logonuserdir "$BSI_LOGON_USER_DIR" \
  --logonuserid "$BSI_LOGON_USER_ID" \
  --logonpwd "$BSI_LOGON_PWD" \
  --contentlibrary "abc 123" \
  --pagewait 5 \
  --secure true \
  --headless true \
  --imagedir ./img \
  --certfile /nodeapp/cert/client.pem \
  --certkeyfile /nodeapp/cert/client_key.pem \
  --includesheetpart 4 \
  --qliksensetag "👍😎 updateSheetThumbnail" \
  --prefix form \
  --log-level verbose
```

### Windows PowerShell

```powershell
docker run -it --rm \
  -v "$(Resolve-Path $env:USERPROFILE\bsi-bsi\img):/nodeapp/img" \
  -v "$(Resolve-Path $env:USERPROFILE\bsi-bsi\cert):/nodeapp/cert" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qseow create-sheet-thumbnails \
  --host $env:BSI_HOST \
  --appid a3e0f5d2-000a-464f-998d-33d333b175d7 \
  --apiuserdir Internal \
  --apiuserid sa_api \
  --loglevel info \
  --logonuserdir $env:BSI_LOGON_USER_DIR \
  --logonuserid $env:BSI_LOGON_USER_ID \
  --logonpwd $env:BSI_LOGON_PWD \
  --contentlibrary 'abc 123' \
  --pagewait 5 \
  --secure true \
  --headless true \
  --imagedir ./img \
  --certfile /nodeapp/cert/client.pem \
  --certkeyfile /nodeapp/cert/client_key.pem \
  --includesheetpart 4 \
  --qliksensetag "👍😎 updateSheetThumbnail" \
  --prefix form \
  --log-level verbose
```

> `Resolve-Path` ensures Windows drive letters are converted into Docker-compatible forms (`C:/path/...`).

---

## Next Steps

- Add any additional CLI options your scenario needs; the Docker container accepts the same arguments as the native binaries.
- For CI/CD, convert these one-liners into scripted steps and pass secrets via your pipeline's secret store rather than plain environment variables.
