# Butler Sheet Icons

**ALWAYS** reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

Butler Sheet Icons is a cross-platform Node.js CLI tool for creating sheet thumbnails based on actual sheet layouts in Qlik Sense applications. Works with both Qlik Sense Cloud and Qlik Sense Enterprise on Windows (QSEoW). The tool uses Puppeteer for browser automation and supports creating single executable binaries.

## Working Effectively

Bootstrap, build, and test the repository:

- Install Node.js 20+ if not available: `apt-get update && apt-get install -y nodejs npm`
- Install dependencies: `npm install`
- **NEVER CANCEL**: Build takes 1-2 minutes for development builds. Set timeout to 5+ minutes.
- **NEVER CANCEL**: Test suite takes 5-20 minutes depending on network connectivity. Set timeout to 30+ minutes.
- Basic functionality test: `npm run test -- --testPathPattern="butler-sheet-icons.test.js" --testTimeout=300000`
- Browser-related tests: `npm run test -- --testPathPattern="browser" --testTimeout=600000`
- Full test suite: `npm test` (takes 15-20 minutes, requires network access to download browsers)

### Build Commands

- Development build: `npx esbuild src/butler-sheet-icons.js --bundle --outfile=build.cjs --format=cjs --platform=node --target=node20 --inject:./src/lib/util/import-meta-url.js --define:import.meta.url=import_meta_url`
- Single executable build (Linux): `node --experimental-sea-config build-script/sea-config.json && cp $(command -v node) butler-sheet-icons && npx postject butler-sheet-icons NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`
- **CRITICAL**: Always clean up build artifacts with `rm build.cjs sea-prep.blob` after builds

### Running the Application

- Show help: `node src/butler-sheet-icons.js --help`
- List available browsers: `node src/butler-sheet-icons.js browser list-available`
- Install browsers: `node src/butler-sheet-icons.js browser install --browser chrome --browser-version latest`
- **NOTE**: Browser installation requires internet access and may take 5-10 minutes

## Validation

**ALWAYS** run through at least one complete end-to-end scenario after making changes:

1. **Basic CLI Validation**: Run `node src/butler-sheet-icons.js --help` and verify all commands show properly
2. **Browser Management**: Test `node src/butler-sheet-icons.js browser list-installed`
3. **Build Validation**: Run the development build command and verify `build.cjs` is created (~6MB)
4. **Test Core Functionality**: Run CLI tests with `npm run test -- --testPathPattern="butler-sheet-icons.test.js"`

### Manual Testing Scenarios

After making changes, **ALWAYS** test at least one of these scenarios:

- **Browser Installation**: `node src/butler-sheet-icons.js browser install --browser chrome` (requires internet)
- **Help System**: Verify all help commands work: `--help`, `qseow --help`, `qscloud --help`, `browser --help`
- **Configuration Loading**: Test with environment variables or config files if modified

## Code Quality and CI Requirements

**ALWAYS** run these before committing or the CI (.github/workflows/ci.yaml) will fail:

- **ESLint**: `npx eslint src/ --max-warnings 0` (may show import/extensions errors, these are expected)
- **Tests**: `npm test` - **NEVER CANCEL**: Full test suite takes 15-20 minutes
- **Build Test**: Verify esbuild works with the development build command above

### Test Environment Setup

Tests require specific environment variables.
When testing locally, set these by running `source ../butler-sheet-icons-env-p2w1.sh` from the repository root.

In CI, these are set via secrets:

```bash
# For QSEoW tests (optional for development)
export BSI_HOST="your-qseow-server"
export BSI_CERT_FILE="path/to/client.pem"
export BSI_CERT_KEY_FILE="path/to/client_key.pem"
export BSI_APP_ID="app-guid"

# For QS Cloud tests (optional for development)
export BSI_CLOUD_TENANT_URL="https://your-tenant.qlikcloud.com"
export BSI_CLOUD_API_KEY="your-api-key"
export BSI_CLOUD_APP_ID="app-guid"

# Test timing
export BSI_TEST_TIMEOUT="1200000"  # 20 minutes
```

**CRITICAL**: Test timeouts are set to 20 minutes by default. **NEVER** reduce these timeouts.

## Common Tasks

### Repository Structure

```
src/
├── butler-sheet-icons.js          # Main CLI entry point
├── globals.js                     # Global configuration and logger
├── lib/
│   ├── browser/                   # Browser management (install/uninstall)
│   ├── cloud/                     # Qlik Sense Cloud integration
│   ├── qseow/                     # QSEoW (on-premises) integration
│   └── util/                      # Shared utilities
├── __tests__/                     # Main CLI tests
└── Dockerfile                     # Docker build configuration
```

### Key Files to Monitor

When making changes, **ALWAYS** check these files:

- `src/globals.js` - Global logger and configuration
- `src/butler-sheet-icons.js` - Main CLI interface
- `package.json` - Dependencies and scripts
- `.github/workflows/ci.yaml` - CI/CD pipeline
- `eslint.config.js` - Linting configuration
- `jest.config.js` - Test configuration

### Running Specific Test Categories

```bash
# Browser functionality tests (5-10 minutes)
npm run test -- --testPathPattern="browser" --testTimeout=600000

# QS Cloud tests (10-15 minutes, requires network/credentials)
npm run test -- --testPathPattern="cloud" --testTimeout=900000

# QSEoW tests (10-15 minutes, requires network/credentials)
npm run test -- --testPathPattern="qseow" --testTimeout=900000
```

## Architecture Notes

### Key Dependencies

- **Puppeteer**: Browser automation for screenshots
- **Commander.js**: CLI argument parsing
- **Winston**: Logging framework
- **Enigma.js**: Qlik Sense WebSocket API
- **esbuild**: Bundling for single executable
- **Jest**: Testing framework

### Browser Management

The tool can install and manage Chrome/Firefox browsers via `@puppeteer/browsers`. Browser installation is required for thumbnail generation functionality.

### Build Process

- Development: Uses esbuild to bundle dependencies
- Production: Creates Single Executable Applications (SEA) using Node.js experimental features
- Docker: Multi-stage build with Puppeteer dependencies

## Debugging Tips

1. Use `--loglevel debug` or `--loglevel silly` for detailed troubleshooting
2. Check certificate paths and permissions for QSEoW connection issues
3. Verify API key validity and network connectivity for QS Cloud issues
4. Use `--headless false` to see browser automation for debugging thumbnails
5. Browser installation failures usually indicate network connectivity issues

## Common Issues

### Network Connectivity

- Browser installation requires internet access to Google/Mozilla CDNs
- Tests may fail in sandboxed environments without external network access
- QS Cloud and QSEoW tests require connections to actual Qlik Sense servers

### Build Issues

- ESLint warnings about unused directives are expected and can be ignored
- Import/extensions ESLint errors are known issues with the current configuration
- esbuild requires the specific inject and define parameters for proper bundling

### Test Failures

- Browser tests fail without internet access (expected in CI/sandboxed environments)
- Timeout errors indicate the need for longer timeout values, not faster tests
- Certificate-related test failures require valid QSEoW certificates

**CRITICAL REMINDER**: **NEVER CANCEL** long-running builds or tests. Build may take several minutes, tests take 15-20+ minutes. Always use appropriate timeouts (5+ minutes for builds, 30+ minutes for tests).
