# Butler Sheet Icons – QSEoW 2025-Nov Support

## Overview

This document describes the changes made to Butler Sheet Icons (BSI) version 3.9.0 to add support for Qlik Sense Enterprise on Windows (QSEoW) 2025-Nov release. This version has been verified to work with the 2025-Nov release and uses the same XPath selectors as the 2025-May release.

## Summary of Changes

The following updates were made to support QSEoW 2025-Nov:

- **Added the new `2025-Nov` value** to the `--sense-version` option for the `qseow` command in `src/butler-sheet-icons.js` and made it the default selection.
- **Introduced dedicated XPath selectors** (`xpathHubUserPageButton2025Nov` and `xpathLogoutButton2025Nov`) in `src/lib/qseow/qseow-process-app.js` to ensure the automation can log out correctly on 2025-Nov hubs. These selectors use the same values as 2025-May.
- **Updated documentation** in `README.md` to reflect the new version choice and added an entry to the supported versions table.
- **Updated changelogs** (`CHANGELOG.md` and `src/CHANGELOG.md`) to document the addition of QSEoW 2025-Nov support.

## Technical Details

### CLI Option Changes

**File:** `src/butler-sheet-icons.js`

The `--sense-version` option now includes `2025-Nov` as a choice, and it has been set as the new default:

```javascript
.addOption(
    new Option('--sense-version <version>', 'Version of the QSEoW server to connect to')
        .choices([
            'pre-2022-Nov',
            '2022-Nov',
            '2023-Feb',
            '2023-May',
            '2023-Aug',
            '2023-Nov',
            '2024-Feb',
            '2024-May',
            '2024-Nov',
            '2025-May',
            '2025-Nov',  // NEW
        ])
        .default('2025-Nov')  // UPDATED
        .env('BSI_QSEOW_CST_SENSE_VERSION')
)
```

### XPath Selector Implementation

**File:** `src/lib/qseow/qseow-process-app.js`

New XPath selector constants were added for the 2025-Nov release. These selectors are used by the browser automation to interact with the Qlik Sense hub interface, specifically for accessing the user menu and logging out:

```javascript
const xpathHubUserPageButton2025Nov =
  'xpath/.//*[@id="q-hub-toolbar"]/div[2]/div[5]/div/div/div/button/span/span';
const xpathLogoutButton2025Nov =
  'xpath/.//*[@id="q-hub-menu-override"]/ng-transclude/ul/li[5]/span[2]';
```

**XPath Details:**

- **Hub User Page Button:** Targets the user profile button in the hub toolbar at `div[2]/div[5]` with nested button and span elements
- **Logout Button:** Targets the logout menu item at list position `li[5]` (5th item) within the user menu dropdown

The conditional mapping logic was updated to select the appropriate XPath selectors based on the version:

```javascript
} else if (options.senseVersion === '2025-Nov') {
    xpathHubUserPageButton = xpathHubUserPageButton2025Nov;
    xpathLogoutButton = xpathLogoutButton2025Nov;
}
```

### Documentation Updates

**File:** `README.md`

1. **CLI Help Text** – Updated to include `2025-Nov` in the choices and reflect the new default:

   ```text
   --sense-version <version>  Version of the QSEoW server to connect to
   (choices: "pre-2022-Nov", "2022-Nov", "2023-Feb", "2023-May",
   "2023-Aug", "2023-Nov", "2024-Feb", "2024-May", "2024-Nov",
   "2025-May", "2025-Nov", default: "2025-Nov")
   ```

2. **Supported Versions Table** – Added new row for 2025-Nov IR:

   | Version     | BSI version | Tested date | Comment                        |
   | ----------- | ----------- | ----------- | ------------------------------ |
   | 2025-Nov IR | 3.9.0       | 2025-Nov-24 | Use `--sense-version 2025-Nov` |

### Changelog Updates

**Files:** `CHANGELOG.md` and `src/CHANGELOG.md`

Both changelog files were updated with a new entry for version 3.9.0:

```markdown
## [3.9.0] - 2025-11-24

### Features

- Add support for QSEoW 2025-Nov version
- Update default `--sense-version` to `2025-Nov`
```

## Usage

### Basic Usage

To use Butler Sheet Icons with QSEoW 2025-Nov, simply run the `create-sheet-thumbnails` command. Since `2025-Nov` is now the default, no version flag is needed:

```bash
butler-sheet-icons qseow create-sheet-thumbnails \
  --host your-qlik-server.example.com \
  --appid your-app-id \
  --certfile ./cert/client.pem \
  --certkeyfile ./cert/client_key.pem \
  # ... other options
```

### Explicit Version Specification

To explicitly specify the 2025-Nov version:

```bash
butler-sheet-icons qseow create-sheet-thumbnails \
  --sense-version 2025-Nov \
  --host your-qlik-server.example.com \
  --appid your-app-id \
  # ... other options
```

### Environment Variable

You can also set the version using an environment variable:

```bash
export BSI_QSEOW_CST_SENSE_VERSION=2025-Nov
butler-sheet-icons qseow create-sheet-thumbnails \
  --host your-qlik-server.example.com \
  --appid your-app-id \
  # ... other options
```

## Manual Verification Notes

To verify the QSEoW 2025-Nov support in your environment:

1. **Deploy a QSEoW 2025-Nov test tenant** matching production login flows with proper certificates and authentication configured.

2. **Run the create-sheet-thumbnails command** with the `2025-Nov` version:

   ```bash
   butler-sheet-icons qseow create-sheet-thumbnails \
     --sense-version 2025-Nov \
     --host your-server \
     --appid your-app-id \
     # ... other required options
   ```

3. **Confirm the following:**
   - The CLI accepts the new version without warnings or errors
   - Screenshots are captured from app sheets successfully
   - Thumbnails are uploaded to the Qlik Sense content library
   - Butler Sheet Icons is able to open the user menu and log out using the new XPath selectors
   - The browser automation completes without hanging or timing out

4. **Check logs** for any XPath-related errors or warnings during the hub navigation and logout phases.

## Browser Automation Context

The XPath selectors are critical for Butler Sheet Icons' browser automation workflow:

1. **Login** – BSI uses Puppeteer to log into the Qlik Sense hub with provided credentials
2. **Navigate** – Opens the specified app and iterates through each sheet
3. **Screenshot** – Captures screenshots of each sheet based on configuration
4. **Upload** – Uploads thumbnails via Qlik Sense APIs
5. **Logout** – Uses the XPath selectors to open the user menu and click the logout button

The `li[5]` position in the logout button XPath indicates that the logout option appears as the 5th item in the user menu dropdown in the 2025-Nov release, matching the 2025-May structure.

## Compatibility Notes

- **XPath Selector Compatibility:** The 2025-Nov release uses the same XPath selectors as 2025-May, indicating no structural changes to the hub interface user menu between these releases.
- **Backward Compatibility:** Butler Sheet Icons continues to support all previous QSEoW versions through the `--sense-version` option.
- **Default Behavior:** Existing scripts without the `--sense-version` flag will now default to `2025-Nov`. Users with older QSEoW versions should explicitly specify their version.

## Migration Guide

### For Users on QSEoW 2025-May or Earlier

If you are running QSEoW 2025-May or an earlier version, you should explicitly specify the version to avoid using the new default:

```bash
# For 2025-May
butler-sheet-icons qseow create-sheet-thumbnails \
  --sense-version 2025-May \
  # ... other options

# For 2024-Nov
butler-sheet-icons qseow create-sheet-thumbnails \
  --sense-version 2024-Nov \
  # ... other options
```

Alternatively, set the environment variable in your shell profile or CI/CD configuration:

```bash
export BSI_QSEOW_CST_SENSE_VERSION=2025-May
```

### For Users Upgrading to QSEoW 2025-Nov

If you are upgrading your QSEoW environment to 2025-Nov:

1. **Update Butler Sheet Icons to version 3.9.0 or later**
2. **Update your scripts** to use `--sense-version 2025-Nov` or remove the flag to use the default
3. **Test in a non-production environment** first to verify screenshot capture and upload functionality
4. **Monitor the first few runs** to ensure the XPath selectors work correctly with your specific QSEoW configuration

## Version History Context

Butler Sheet Icons maintains version-specific XPath selectors because Qlik Sense's hub interface has evolved over time:

- **Pre-2022-Nov:** Original hub structure
- **2022-Nov:** Significant UI changes with new header structure
- **2023-Feb through 2023-Nov:** Iterative menu positioning changes (`li[5]` vs `li[6]`)
- **2024-Feb through 2024-Nov:** Further refinements to toolbar structure
- **2025-May and 2025-Nov:** Stabilized structure with `li[5]` for logout

The version-specific approach ensures Butler Sheet Icons can reliably interact with the hub interface across all supported QSEoW releases.

## Troubleshooting

If you encounter issues with QSEoW 2025-Nov support:

### Issue: "Invalid Sense version specified" Error

**Solution:** Ensure you are using Butler Sheet Icons version 3.9.0 or later, which includes 2025-Nov support.

```bash
butler-sheet-icons --version
```

### Issue: Browser Automation Fails to Logout

**Symptoms:** The browser hangs at the logout step, timeout errors, or "element not found" errors in logs.

**Possible Causes:**

- XPath selectors may not match your specific QSEoW configuration
- Qlik Sense hub interface customizations
- Timing issues with page load

**Solution:**

1. Run with `--loglevel verbose` or `--loglevel debug` to see detailed XPath interaction logs
2. Try increasing `--pagewait` value to allow more time for page elements to load
3. Run with `--headless false` to visually observe the browser automation
4. Verify the XPath selectors match your hub interface structure using browser developer tools

### Issue: Default Version Changed Unexpectedly

**Symptom:** Scripts that previously worked now fail or behave differently.

**Cause:** Butler Sheet Icons 3.9.0 changed the default `--sense-version` from `2025-May` to `2025-Nov`.

**Solution:** Explicitly specify the version appropriate for your QSEoW environment:

```bash
butler-sheet-icons qseow create-sheet-thumbnails \
  --sense-version 2025-May \
  # ... other options
```

## Follow-Up Actions

### For Butler Sheet Icons Maintainers

- Consider extending Jest test coverage in `src/lib/qseow/__tests__` to assert XPath mapping for the 2025-Nov release
- Monitor community feedback for any XPath selector issues specific to different QSEoW 2025-Nov deployment configurations
- Update the public Butler Sheet Icons documentation site with 2025-Nov support announcement

### For QSEoW Administrators

- Test Butler Sheet Icons 3.9.0 in a non-production environment before deploying to production
- Update any automation scripts or documentation to reflect the new default version
- Consider creating a test schedule to verify Butler Sheet Icons compatibility with future QSEoW releases

### For Documentation Repository Maintainers

This file can be used as a reference for updating the Butler Sheet Icons documentation repository. Key sections to update:

1. **Getting Started / Installation** – Update version references to 3.9.0
2. **Command Reference** – Update `--sense-version` option documentation to include `2025-Nov` and reflect new default
3. **Supported Versions** – Add 2025-Nov IR to the compatibility matrix
4. **Changelog / Release Notes** – Add entry for 3.9.0 release with 2025-Nov support
5. **Troubleshooting** – Add notes about default version change for users on older QSEoW versions
6. **Examples** – Consider adding a 2025-Nov specific example if there are any unique considerations

## Additional Resources

- [Butler Sheet Icons GitHub Repository](https://github.com/ptarmiganlabs/butler-sheet-icons)
- [Qlik Sense Enterprise on Windows Documentation](https://help.qlik.com/en-US/sense-admin/Subsystems/DeployAdministerQSE/Content/Sense_DeployAdminister/QSEoW/Administer_QSEoW/Managing_QSEoW.htm)
- [Butler Sheet Icons Documentation Site](https://butler-sheet-icons.ptarmiganlabs.com)

## Questions or Issues?

If you encounter any issues with QSEoW 2025-Nov support or have questions about Butler Sheet Icons:

- **GitHub Issues:** [https://github.com/ptarmiganlabs/butler-sheet-icons/issues](https://github.com/ptarmiganlabs/butler-sheet-icons/issues)
- **Discussions:** [https://github.com/ptarmiganlabs/butler-sheet-icons/discussions](https://github.com/ptarmiganlabs/butler-sheet-icons/discussions)
