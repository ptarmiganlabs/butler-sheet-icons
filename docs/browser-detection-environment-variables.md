# Browser Detection and Environment Variables in Butler Sheet Icons

## Overview

Butler Sheet Icons (BSI) automatically detects and uses available browsers in a smart priority order, enabling seamless operation in both internet-connected and air-gapped environments. This document explains the browser detection mechanism and associated environment variables.

### Browser Availability by Distribution

**Docker Image** (recommended for air-gapped deployments):

- ✅ **Chromium browser embedded** (~247 MB)
- ✅ **Air-gapped ready out of the box** - no internet required
- ✅ Works with `--network none` flag
- Image size: ~1.32 GB

**Native Binaries** (Windows `.exe`, macOS, Linux executables):

- ❌ **No embedded browser**
- Smaller file size (~50-80 MB per platform)
- **Requires browser setup for air-gapped use**:
  - Pre-download browser cache OR
  - Set `PUPPETEER_EXECUTABLE_PATH` to system browser
- First run requires internet if no browser configured

---

## Browser Detection Priority

When BSI needs a browser for taking sheet screenshots, it searches for available browsers in the following order:

### 1. System Browser (Highest Priority) ✅

- **Trigger**: `PUPPETEER_EXECUTABLE_PATH` environment variable is set
- **Use Case**: Docker containers, air-gapped environments, custom browser installations
- **Behavior**: BSI will use the browser at the specified path without attempting any downloads
- **Network Required**: No

### 2. Cached Browser (Medium Priority) ✅

- **Location**: `~/.cache/puppeteer/` directory
- **Use Case**: Previously downloaded browsers from internet-connected runs
- **Behavior**: BSI detects and uses browsers already present in the Puppeteer cache
- **Network Required**: No

### 3. Download Browser (Lowest Priority) 📥

- **Trigger**: No system or cached browser found
- **Use Case**: First-time use in internet-connected environments
- **Behavior**: BSI downloads the requested browser version from the internet
- **Network Required**: Yes

---

## Environment Variables

### `PUPPETEER_EXECUTABLE_PATH`

**Purpose**: Specifies the path to a system-installed browser executable.

**Format**: Absolute file path to browser executable

**Examples**:

```bash
# Docker/Alpine Linux (embedded Chromium)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Ubuntu/Debian
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# macOS
PUPPETEER_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Windows
PUPPETEER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

**When to Use**:

- ✅ Docker containers with embedded browsers
- ✅ Air-gapped/offline environments
- ✅ Corporate environments with pre-installed browsers
- ✅ Custom browser builds or specific versions
- ✅ When you want to avoid downloads and use a known browser

**Docker Usage**:

```dockerfile
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

**Command Line Usage** (overrides Dockerfile):

```bash
docker run -e PUPPETEER_EXECUTABLE_PATH=/custom/path/to/browser ptarmiganlabs/butler-sheet-icons:latest ...
```

---

### `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`

**Purpose**: Prevents Puppeteer from automatically downloading Chrome during npm install.

**Format**: `true` or `false` (string)

**Default**: `false`

**Examples**:

```bash
# Docker
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Shell
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

**When to Use**:

- ✅ Docker image builds (to avoid bloating the image)
- ✅ CI/CD pipelines
- ✅ When using `PUPPETEER_EXECUTABLE_PATH`
- ✅ When you'll manage browser installation manually

**Important**: This only affects `npm install` behavior, not runtime browser detection. BSI will still attempt to download a browser at runtime if none is found, regardless of this setting.

---

## Usage Scenarios

### Scenario 1: Docker Container (Air-Gapped Ready)

**Setup**: Use the official BSI Docker image with embedded Chromium.

**Environment Variables** (already set in image):

```dockerfile
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

**Behavior**:

1. BSI checks `PUPPETEER_EXECUTABLE_PATH` → finds `/usr/bin/chromium-browser`
2. Verifies file exists → Yes
3. Uses embedded Chromium directly
4. **No internet connection required** ✅

**Log Output**:

```
2025-11-21T12:00:00.000Z info: Checking for available browsers...
2025-11-21T12:00:00.001Z info: Found system browser at: /usr/bin/chromium-browser
2025-11-21T12:00:00.001Z info: Using system browser (PUPPETEER_EXECUTABLE_PATH is set)
2025-11-21T12:00:00.002Z info: Browser ready from system: chrome system-installed
2025-11-21T12:00:00.003Z info: Browser setup complete. Launching browser...
```

---

### Scenario 2: First Run (Internet Connected)

**Setup**: Fresh installation with internet access, no cached browsers.

**Environment Variables**: None set

**Behavior**:

1. BSI checks `PUPPETEER_EXECUTABLE_PATH` → not set
2. Checks `~/.cache/puppeteer/` → empty
3. Downloads browser from internet
4. Caches browser for future use
5. **Internet connection required** 📥

**Log Output**:

```
2025-11-21T12:00:00.000Z info: Checking for available browsers...
2025-11-21T12:00:00.100Z info: No local browser found. Downloading and installing browser...
2025-11-21T12:00:00.150Z info: Resolved browser build id: "130.0.6723.116" for browser "chrome"
2025-11-21T12:00:10.000Z info: Browser "chrome" version "130.0.6723.116" installed
2025-11-21T12:00:10.050Z info: Browser downloaded successfully
2025-11-21T12:00:10.100Z info: Browser setup complete. Launching browser...
```

---

### Scenario 3: Using Cached Browser (Offline After First Run)

**Setup**: Browser previously downloaded, now working offline.

**Environment Variables**: None set

**Behavior**:

1. BSI checks `PUPPETEER_EXECUTABLE_PATH` → not set
2. Checks `~/.cache/puppeteer/` → finds cached browser
3. Uses cached browser
4. **No internet connection required** ✅

**Log Output**:

```
2025-11-21T12:00:00.000Z info: Checking for available browsers...
2025-11-21T12:00:00.050Z info: Found 1 cached browser(s)
2025-11-21T12:00:00.051Z info: Using cached browser: chrome 130.0.6723.116
2025-11-21T12:00:00.052Z info: Browser ready from cache: chrome 130.0.6723.116
2025-11-21T12:00:00.053Z info: Browser setup complete. Launching browser...
```

---

### Scenario 4: Air-Gapped with Pre-Cached Browser

**Setup**: Manually copied browser to `~/.cache/puppeteer/` before going offline.

**Cache Directory Structure**:

```
~/.cache/puppeteer/
└── chrome/
    └── linux-130.0.6723.116/
        └── chrome-linux64/
            └── chrome
```

**Behavior**:

1. BSI checks `PUPPETEER_EXECUTABLE_PATH` → not set
2. Checks `~/.cache/puppeteer/` → finds browser
3. Uses cached browser
4. **No internet connection required** ✅

**How to Pre-Cache**:

```bash
# On internet-connected machine
./butler-sheet-icons browser install --browser chrome --browser-version 130.0.6723.116

# Copy cache directory
tar -czf puppeteer-cache.tar.gz ~/.cache/puppeteer

# On air-gapped machine
tar -xzf puppeteer-cache.tar.gz -C ~/
```

---

### Scenario 5: Docker - Override Embedded Browser

**Setup**: Docker image with embedded Chromium, but you want to use a different/newer browser version.

**Method 1 - Use Cached Browser (Recommended)**:

Mount a volume with cached browsers to override the embedded one:

```bash
# First, download the browser you want on your host machine
./butler-sheet-icons browser install --browser chrome --browser-version latest

# Then mount the cache directory when running Docker
docker run -it --rm \
  -v "$HOME/.cache/puppeteer:/home/nodejs/.cache/puppeteer" \
  -e PUPPETEER_EXECUTABLE_PATH="" \
  -v "$HOME/bsi-bsi/img:/nodeapp/img" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qscloud create-sheet-thumbnails \
  --tenanturl "$BSI_CLOUD_TENANT_URL" \
  --apikey "$BSI_CLOUD_API_KEY" \
  --appid "$BSI_CLOUD_APP_ID" \
  --imagedir ./img
```

**Behavior**:

1. `PUPPETEER_EXECUTABLE_PATH=""` (empty string) → skips system browser check
2. Checks `/home/nodejs/.cache/puppeteer` → finds your mounted browser
3. Uses your cached browser instead of embedded one
4. **No download needed** (browser pre-cached on host)

**Method 2 - Download Inside Container**:

Unset `PUPPETEER_EXECUTABLE_PATH` and provide network access to download:

```bash
docker run -it --rm \
  -e PUPPETEER_EXECUTABLE_PATH="" \
  -e PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false \
  -v "$HOME/bsi-bsi/img:/nodeapp/img" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qscloud create-sheet-thumbnails \
  --tenanturl "$BSI_CLOUD_TENANT_URL" \
  --apikey "$BSI_CLOUD_API_KEY" \
  --appid "$BSI_CLOUD_APP_ID" \
  --browser chrome \
  --browser-version latest \
  --imagedir ./img
```

**Behavior**:

1. `PUPPETEER_EXECUTABLE_PATH=""` → skips system browser
2. No cached browser found
3. Downloads latest Chrome from internet
4. **Internet connection required** 📥
5. Browser cached inside container (lost when container stops unless volume mounted)

**Method 3 - Persistent Cache Volume**:

Best of both worlds - download once, reuse across container restarts:

```bash
# Create a named volume for persistent browser cache
docker volume create bsi-browser-cache

# First run downloads the browser
docker run -it --rm \
  -v bsi-browser-cache:/home/nodejs/.cache/puppeteer \
  -e PUPPETEER_EXECUTABLE_PATH="" \
  -v "$HOME/bsi-bsi/img:/nodeapp/img" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qscloud create-sheet-thumbnails \
  --tenanturl "$BSI_CLOUD_TENANT_URL" \
  --apikey "$BSI_CLOUD_API_KEY" \
  --appid "$BSI_CLOUD_APP_ID" \
  --browser chrome \
  --browser-version latest \
  --imagedir ./img

# Subsequent runs use the cached browser (no download)
docker run -it --rm \
  -v bsi-browser-cache:/home/nodejs/.cache/puppeteer \
  -e PUPPETEER_EXECUTABLE_PATH="" \
  -v "$HOME/bsi-bsi/img:/nodeapp/img" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qscloud create-sheet-thumbnails ...
```

**Why Override?**

- ✅ Use latest browser version (embedded version may be older)
- ✅ Test with specific browser versions
- ✅ Use Firefox instead of Chrome
- ✅ Match browser version with production environment
- ✅ Access newer browser features or bug fixes

**Trade-offs**:

| Approach                 | Network Required | Persistent | Flexibility | Speed   |
| ------------------------ | ---------------- | ---------- | ----------- | ------- |
| Embedded (default)       | No               | Yes        | Low         | Fastest |
| Mounted host cache       | No               | Yes        | High        | Fast    |
| Download per run         | Yes              | No         | High        | Slowest |
| Named volume (container) | Yes (first time) | Yes        | High        | Fast    |

---

## Air-Gapped Environment Setup Guide

This section provides step-by-step instructions for setting up BSI in environments without internet access.

### Docker Image (Recommended for Air-Gapped)

**Advantages**:

- ✅ Browser already embedded (no setup required)
- ✅ Works immediately in air-gapped environment
- ✅ Consistent across all deployments
- ✅ No dependency on host system browser

**Setup Steps**:

1. **On internet-connected machine**: Pull or build the Docker image

```bash
# Pull from Docker Hub
docker pull ptarmiganlabs/butler-sheet-icons:latest

# Save image to tar file
docker save ptarmiganlabs/butler-sheet-icons:latest -o butler-sheet-icons.tar
```

2. **Transfer to air-gapped machine**: Copy `butler-sheet-icons.tar` via approved method (USB, secure file transfer, etc.)

3. **On air-gapped machine**: Load the image

```bash
# Load image
docker load -i butler-sheet-icons.tar

# Verify it works without network
docker run --rm --network none ptarmiganlabs/butler-sheet-icons:latest --version
```

4. **Run normally**: Use without any special configuration

```bash
docker run -it --rm \
  -v "$HOME/bsi-bsi/img:/nodeapp/img" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qscloud create-sheet-thumbnails \
  --tenanturl "$BSI_CLOUD_TENANT_URL" \
  --apikey "$BSI_CLOUD_API_KEY" \
  --appid "$BSI_CLOUD_APP_ID" \
  --imagedir ./img
```

**Notes**:

- No environment variables needed (already set in image)
- Chromium version: Latest from Alpine repository at build time
- Image size: ~1.32 GB

---

### Native Binaries (Windows/macOS/Linux) for Air-Gapped

**Challenges**:

- ❌ No embedded browser
- ❌ Requires pre-caching or system browser
- ⚠️ More complex setup than Docker

**Option A: Pre-Cache Browser** (Recommended)

Transfer the browser cache from an internet-connected machine.

**On internet-connected machine**:

```bash
# Download BSI binary for your platform
# Available at: https://github.com/ptarmiganlabs/butler-sheet-icons/releases

# Download and cache the browser
./butler-sheet-icons browser install --browser chrome --browser-version latest

# Verify browser is cached
./butler-sheet-icons browser list-installed
# Should show: chrome@xxx.x.xxxx.xx (or similar)

# Create archive of cache directory
# Windows (PowerShell):
Compress-Archive -Path "$env:USERPROFILE\.cache\puppeteer" -DestinationPath puppeteer-cache.zip

# macOS/Linux:
tar -czf puppeteer-cache.tar.gz ~/.cache/puppeteer
```

**Transfer to air-gapped machine**:

Copy the binary AND cache archive via approved method.

**On air-gapped machine**:

```bash
# Windows (PowerShell):
Expand-Archive -Path puppeteer-cache.zip -DestinationPath "$env:USERPROFILE\.cache\puppeteer"

# macOS/Linux:
mkdir -p ~/.cache
tar -xzf puppeteer-cache.tar.gz -C ~/

# Verify browser is available
./butler-sheet-icons browser list-installed

# Test without network (will use cached browser)
./butler-sheet-icons qscloud create-sheet-thumbnails \
  --tenanturl "$BSI_CLOUD_TENANT_URL" \
  --apikey "$BSI_CLOUD_API_KEY" \
  --appid "$BSI_CLOUD_APP_ID" \
  --imagedir ./img
```

**Option B: System-Installed Browser**

Use a browser already installed on the air-gapped machine.

**Requirements**:

- Chrome or Chromium installed via OS package manager or installer
- Know the path to the browser executable

**Common Browser Paths**:

```bash
# Windows
C:\Program Files\Google\Chrome\Application\chrome.exe
C:\Program Files (x86)\Google\Chrome\Application\chrome.exe

# macOS
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
/Applications/Chromium.app/Contents/MacOS/Chromium

# Linux (Ubuntu/Debian)
/usr/bin/google-chrome
/usr/bin/chromium
/usr/bin/chromium-browser

# Linux (RHEL/CentOS)
/usr/bin/google-chrome-stable
/usr/bin/chromium-browser
```

**Setup**:

1. **Set environment variable** (choose one method):

```bash
# Method 1: Export before running (temporary)
# Windows (PowerShell):
$env:PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"

# macOS/Linux:
export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Method 2: Set system-wide (permanent)
# Add to your shell profile (~/.bashrc, ~/.zshrc, or Windows Environment Variables)
```

2. **Verify browser path**:

```bash
# Windows (PowerShell):
Test-Path $env:PUPPETEER_EXECUTABLE_PATH

# macOS/Linux:
ls -l "$PUPPETEER_EXECUTABLE_PATH"
```

3. **Run BSI** (will use system browser):

```bash
./butler-sheet-icons qscloud create-sheet-thumbnails \
  --tenanturl "$BSI_CLOUD_TENANT_URL" \
  --apikey "$BSI_CLOUD_API_KEY" \
  --appid "$BSI_CLOUD_APP_ID" \
  --imagedir ./img
```

**Option C: Hybrid (Docker with Native Binary's Cache)**

Run native binary first to cache browser, then use with Docker.

```bash
# On connected machine: Use native binary to download browser
./butler-sheet-icons browser install --browser chrome --browser-version latest

# On air-gapped machine: Mount the cache into Docker
docker run -it --rm \
  -v "$HOME/.cache/puppeteer:/home/nodejs/.cache/puppeteer" \
  -e PUPPETEER_EXECUTABLE_PATH="" \
  -v "$HOME/bsi-bsi/img:/nodeapp/img" \
  ptarmiganlabs/butler-sheet-icons:latest \
  qscloud create-sheet-thumbnails \
  --tenanturl "$BSI_CLOUD_TENANT_URL" \
  --apikey "$BSI_CLOUD_API_KEY" \
  --appid "$BSI_CLOUD_APP_ID" \
  --imagedir ./img
```

---

### Air-Gapped Quick Reference

| Method                  | Setup Complexity | Network at Runtime | Best For                |
| ----------------------- | ---------------- | ------------------ | ----------------------- |
| Docker (embedded)       | Easy             | No                 | Production deployments  |
| Native + Pre-cached     | Medium           | No                 | Workstations, servers   |
| Native + System browser | Medium           | No                 | Controlled environments |
| Native (download)       | Easy             | **Yes**            | Dev/test only           |

---

### Verification Checklist

Before deploying to air-gapped environment, verify:

- [ ] **Docker**: Can run with `--network none` flag
- [ ] **Native**: Browser listed in `browser list-installed` output
- [ ] **Native**: `PUPPETEER_EXECUTABLE_PATH` set and file exists
- [ ] **Test run**: Successfully creates thumbnails without network
- [ ] **Documentation**: Browser version documented for compliance
- [ ] **Transfer**: All files copied (binary, cache, certificates, etc.)

---

## Troubleshooting

### Problem: "Error installing browser" in Air-Gapped Environment

**Symptoms**:

```
Error: Download failed: server returned code 404
```

**Cause**: BSI is trying to download a browser but has no internet access.

**Solutions**:

1. **For Docker**: Ensure `PUPPETEER_EXECUTABLE_PATH` is set correctly

   ```bash
   docker run --rm --entrypoint=/bin/sh your-image -c "ls -l $PUPPETEER_EXECUTABLE_PATH"
   ```

2. **For Standalone**: Pre-cache the browser

   ```bash
   # On connected machine
   ./butler-sheet-icons browser install --browser chrome --browser-version latest

   # Copy ~/.cache/puppeteer to air-gapped machine
   ```

3. **Verify Detection**:
   ```bash
   # Check logs for "Found system browser" or "Found cached browser"
   # If you see "No local browser found. Downloading..." → setup is incorrect
   ```

---

### Problem: "PUPPETEER_EXECUTABLE_PATH is set but file does not exist"

**Symptoms**:

```
PUPPETEER_EXECUTABLE_PATH is set to "/path/to/browser" but file does not exist
```

**Cause**: The path specified doesn't point to an actual executable.

**Solutions**:

1. **Verify path**:

   ```bash
   ls -l $PUPPETEER_EXECUTABLE_PATH
   which chromium-browser
   ```

2. **Common paths**:

   - Alpine Linux: `/usr/bin/chromium-browser`
   - Ubuntu: `/usr/bin/chromium` or `/usr/bin/chromium-browser`
   - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

3. **Docker troubleshooting**:
   ```bash
   docker run --rm --entrypoint=/bin/sh your-image -c "find /usr -name '*chrom*' 2>/dev/null"
   ```

---

### Problem: Browser Version Mismatch

**Symptoms**: Browser starts but crashes or behaves unexpectedly.

**Cause**: Puppeteer version incompatible with browser version.

**Solutions**:

1. **Use latest versions** of both BSI and browser
2. **Check compatibility**: See [Puppeteer Chromium support](https://pptr.dev/chromium-support)
3. **Specify exact version**:
   ```bash
   ./butler-sheet-icons qseow create-sheet-thumbnails \
     --browser chrome \
     --browser-version 130.0.6723.116 \
     ...
   ```

---

## Command-Line Options

### `--browser <type>`

**Values**: `chrome`, `firefox`  
**Default**: `chrome`  
**Description**: Browser type to use

### `--browser-version <version>`

**Values**: Version string or `latest`  
**Default**: `latest`  
**Description**: Browser version to download (only used if download is needed)

**Examples**:

```bash
# Use latest Chrome
./butler-sheet-icons qseow create-sheet-thumbnails --browser chrome --browser-version latest ...

# Use specific version
./butler-sheet-icons qseow create-sheet-thumbnails --browser chrome --browser-version 130.0.6723.116 ...
```

**Note**: These options are **ignored** when using `PUPPETEER_EXECUTABLE_PATH` (system browser) or a cached browser. They only affect downloads.

---

## Browser Management Commands

### List Installed Browsers

```bash
./butler-sheet-icons browser list-installed
```

Shows browsers in `~/.cache/puppeteer/`.

### Install Browser Manually

```bash
./butler-sheet-icons browser install --browser chrome --browser-version latest
```

Downloads browser to cache directory for offline use.

### List Available Versions

```bash
./butler-sheet-icons browser list-available --browser chrome
```

Shows downloadable Chrome versions (requires internet).

### Uninstall Browser

```bash
./butler-sheet-icons browser uninstall --browser chrome --browser-version 130.0.6723.116
```

Removes specific browser from cache.

---

## Best Practices

### ✅ For Docker Deployments

1. Use the official BSI Docker image (Chromium embedded) - works air-gapped
2. To use a newer browser: Set `-e PUPPETEER_EXECUTABLE_PATH=""` and mount cache volume
3. For consistent browser versions: Use named volumes or mount host cache
4. Test in air-gapped mode: `docker run --network none ...`
5. For production: Pin browser versions to avoid unexpected changes

### ✅ For Air-Gapped Environments

1. **Option A**: Use Docker with embedded browser (recommended)
2. **Option B**: Pre-cache browser before going offline
3. Verify browser availability before deployment
4. Document the browser version used

### ✅ For CI/CD Pipelines

1. Set `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` during build
2. Install browser as separate step or use Docker
3. Cache browser between pipeline runs
4. Version-pin browsers for reproducibility

### ✅ For Development

1. Let BSI download browser on first run (easiest)
2. Cached browser persists for offline work
3. Use `browser list-installed` to see what's cached
4. Update browser with `browser install` when needed

---

## Docker Image Details

The official Butler Sheet Icons Docker image includes:

**Base**: `node:22-alpine`

**Embedded Browser**: Chromium (247 MB)

- Location: `/usr/lib/chromium/`
- Executable: `/usr/bin/chromium-browser`
- Version: Latest stable from Alpine repository

**Pre-configured Environment**:

```dockerfile
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production
```

**Size**: ~1.32 GB (optimized from 2.83 GB)

**Capabilities**:

- ✅ Fully air-gapped ready
- ✅ No internet required at runtime
- ✅ All browser dependencies included
- ✅ Works with `--network none`

---

## Migration Guide

### From BSI < 3.8.0 (Old Behavior)

**Old Behavior**:

- Always attempted to download browser
- Failed in air-gapped environments
- No system browser detection

**New Behavior (3.8.0+)**:

- Detects system/cached browsers first
- Downloads only if necessary
- Air-gapped friendly

**Action Required**:

- **Docker users**: Update to latest image (automatic fix)
- **Standalone users**: No changes needed (backward compatible)
- **Air-gapped users**: Set `PUPPETEER_EXECUTABLE_PATH` or pre-cache browser

---

## Technical Details

### Browser Detection Algorithm

```javascript
async function detectBrowser(options) {
  // 1. Check system browser
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    if (fileExists(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      return {
        path: process.env.PUPPETEER_EXECUTABLE_PATH,
        source: "system",
      };
    }
  }

  // 2. Check cached browsers
  const cached = getInstalledBrowsers("~/.cache/puppeteer");
  if (cached.length > 0) {
    return {
      path: cached[0].executablePath,
      source: "cache",
    };
  }

  // 3. Download required
  return null;
}
```

### Files Modified (BSI 3.8.0)

- `src/lib/browser/browser-detect.js` - New detection logic
- `src/lib/qseow/qseow-process-app.js` - Uses detection before download
- `src/lib/cloud/process-cloud-app.js` - Uses detection before download
- `src/Dockerfile` - Optimized with embedded Chromium

---

## FAQ

**Q: Do I need to set `PUPPETEER_EXECUTABLE_PATH` when using the Docker image?**  
A: No, it's already set correctly in the image.

**Q: Can I use a newer browser version instead of the embedded one in Docker?**  
A: Yes! Set `-e PUPPETEER_EXECUTABLE_PATH=""` (empty string) and mount a volume with your cached browser or allow downloads. See Scenario 5 for details.

**Q: Can I override the Docker image's browser to use a custom one?**  
A: Yes, use `-e PUPPETEER_EXECUTABLE_PATH=/your/browser` when running the container.

**Q: What happens if the browser at `PUPPETEER_EXECUTABLE_PATH` doesn't exist?**  
A: BSI logs a warning and falls back to checking cached browsers.

**Q: Can I use Firefox instead of Chrome?**  
A: Yes, but Docker image includes only Chromium. For standalone, use `--browser firefox`.

**Q: How much disk space do cached browsers use?**  
A: Approximately 200-300 MB per browser version.

**Q: Can I have multiple browser versions cached?**  
A: Yes, BSI will use the first matching browser found in cache.

**Q: Does this work on Windows/macOS/Linux?**  
A: Yes, browser detection works on all platforms. Docker image is Linux-only.

**Q: Which distribution should I use for air-gapped environments?**  
A: Docker image is strongly recommended. It has Chromium embedded and works immediately without setup. Native binaries require pre-caching the browser or installing Chrome/Chromium system-wide.

**Q: Do native binaries (Windows/macOS/Linux executables) include a browser?**  
A: No. Native binaries are 50-80 MB and do not embed browsers. For air-gapped use, you must pre-cache the browser or point to a system-installed Chrome/Chromium via `PUPPETEER_EXECUTABLE_PATH`.

**Q: How do I update the browser in an air-gapped Docker deployment?**  
A: Download a new BSI Docker image (with updated embedded Chromium) on a connected machine, save it to tar, transfer to air-gapped environment, and load it. Alternatively, mount a volume with a newer cached browser and set `PUPPETEER_EXECUTABLE_PATH=""`.

**Q: Can I use the same browser cache for both Docker and native binaries?**  
A: Yes! You can mount your host's `~/.cache/puppeteer` directory into the Docker container. This is useful if you want to use a specific browser version across both deployment types.

---

## Support and Resources

- **Documentation**: https://butler-sheet-icons.ptarmiganlabs.com
- **GitHub Issues**: https://github.com/ptarmiganlabs/butler-sheet-icons/issues
- **Docker Hub**: https://hub.docker.com/r/ptarmiganlabs/butler-sheet-icons

---

## Changelog

### Version 3.8.0 (November 2025)

- ✅ Added intelligent browser detection (system, cache, download)
- ✅ Added `PUPPETEER_EXECUTABLE_PATH` support
- ✅ Air-gapped environment support
- ✅ Docker image optimized (53% size reduction)
- ✅ Embedded Chromium in Docker image
- ✅ No internet required for Docker deployments

### Previous Versions

- Always attempted browser download
- Required internet connection
- No air-gapped support
