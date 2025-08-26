# Copilot Instructions for Butler Sheet Icons

## Project Overview

Butler Sheet Icons is a cross-platform, command-line tool that creates thumbnail images based on the actual layout of sheets in Qlik Sense applications. It works with both Qlik Sense Cloud and Qlik Sense Enterprise on Windows (QSEoW), using browser automation to capture real sheet layouts and upload them as thumbnails.

### Key Features
- Automated sheet thumbnail generation from actual Qlik Sense layouts
- Support for both QS Cloud and QSEoW platforms
- Browser automation using Puppeteer for screenshot capture
- Bulk processing of multiple apps using Qlik Sense tags
- Content library integration for QSEoW deployments
- Flexible exclusion patterns for sheets
- Docker container support

## Architecture

### Core Components

1. **CLI Interface** (`src/butler-sheet-icons.js`)
   - Commander.js-based CLI with subcommands for `qseow`, `qscloud`, and `browser`
   - Environment variable support with command-line override capability
   - Comprehensive option validation and help text

2. **QSEoW Integration** (`src/lib/qseow/`)
   - Certificate-based authentication with Qlik Sense
   - QRS API interactions for app metadata and content library management
   - Enigma.js integration for real-time app data access
   - Sheet exclusion logic and bulk app processing

3. **QS Cloud Integration** (`src/lib/cloud/`)
   - API key-based authentication
   - REST API interactions for app management
   - Collection management functionality

4. **Browser Management** (`src/lib/browser/`)
   - Puppeteer-core integration for headless browser automation
   - Chrome/Chromium download and version management
   - Screenshot capture with configurable wait times and dimensions

5. **Utilities** (`src/lib/util/`)
   - Certificate path resolution
   - Enigma.js schema management
   - Common helper functions

### Technology Stack

- **Node.js** with ES modules (`type: "module"`)
- **Commander.js** for CLI interface
- **Puppeteer-core** for browser automation
- **Enigma.js** for Qlik Sense engine communication
- **qrs-interact** for QRS API communication
- **Winston** for structured logging
- **Jimp** for image processing
- **Jest** for testing with coverage
- **ESLint** for code quality

## Development Guidelines

### Code Style and Patterns

1. **ES Modules**: Always use ES module syntax (`import`/`export`)
2. **Async/Await**: Prefer async/await over Promises for better readability
3. **Error Handling**: Use try-catch blocks with comprehensive error logging
4. **Logging**: Use the global `logger` instance with appropriate levels (verbose, debug, info, warn, error)
5. **Configuration**: Support both command-line options and environment variables

### Common Patterns

#### Logger Usage
```javascript
import { logger } from '../../globals.js';

logger.debug('Debug information for troubleshooting');
logger.verbose('Detailed operational information');
logger.info('General information about progress');
logger.warn('Warning about potential issues');
logger.error('Error information with context');
```

#### Error Handling
```javascript
try {
    // Operation that might fail
    const result = await someAsyncOperation();
    logger.debug('Operation completed successfully');
    return result;
} catch (err) {
    logger.error(`CONTEXT: ${err.message}`);
    if (err.stack) {
        logger.error(`CONTEXT (stack): ${err.stack}`);
    }
    throw new Error('Descriptive error message for user');
}
```

#### Path Resolution
```javascript
import upath from 'upath';
import { bsiExecutablePath } from '../../globals.js';

const resolvedPath = upath.isAbsolute(options.filepath)
    ? options.filepath
    : upath.join(bsiExecutablePath, options.filepath);
```

#### Enigma Connection Setup
```javascript
const configEnigma = setupEnigmaConnection(appId, options);
const session = await enigma.create(configEnigma);
const global = await session.open();
const app = await global.openDoc(appId);
```

### File Organization

```
src/
├── butler-sheet-icons.js          # Main CLI entry point
├── globals.js                     # Global configuration and logger
├── lib/
│   ├── browser/                   # Browser management
│   │   ├── browser-install.js     # Browser installation
│   │   ├── browser-installed.js   # Check installed browsers
│   │   └── browser-uninstall.js   # Browser cleanup
│   ├── cloud/                     # QS Cloud functionality
│   │   ├── cloud-create-thumbnails.js
│   │   ├── cloud-collections.js
│   │   └── cloud-remove-sheet-icons.js
│   ├── qseow/                     # QSEoW functionality
│   │   ├── qseow-create-thumbnails.js
│   │   ├── qseow-enigma.js        # Enigma.js setup
│   │   ├── qseow-qrs.js           # QRS API setup
│   │   ├── qseow-process-app.js   # Main app processing
│   │   └── qseow-certificates.js  # Certificate validation
│   └── util/                      # Shared utilities
│       ├── cert.js                # Certificate path resolution
│       └── enigma-util.js         # Enigma schema management
```

## Testing Guidelines

### Test Structure
- Tests are located in `__tests__` directories within each module
- Use Jest with ES modules support
- Mock external dependencies (enigma.js, qrs-interact, puppeteer)
- Test both success and error scenarios

### Test Patterns
```javascript
import { test, expect, describe, jest, beforeEach } from '@jest/globals';
import { functionToTest } from '../module.js';

// Mock external dependencies
jest.mock('external-dependency');

describe('module functionality', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle success case', async () => {
        // Test implementation
    });

    test('should handle error case', async () => {
        // Test error scenarios
    });
});
```

### Running Tests
```bash
npm test                    # Run all tests with coverage
npm run test:watch         # Run tests in watch mode
```

## Configuration Patterns

### Environment Variables
All CLI options can be set via environment variables with the pattern:
- QSEoW: `BSI_QSEOW_CST_<OPTION_NAME>`
- QS Cloud: `BSI_QSCLOUD_CST_<OPTION_NAME>`

### Option Processing
```javascript
// Command line options override environment variables
const finalValue = options.configValue || process.env.BSI_ENV_VAR || defaultValue;
```

## Security Considerations

1. **Certificate Handling**: Always validate certificate paths and existence
2. **API Keys**: Never log API keys or sensitive credentials
3. **Path Traversal**: Use `upath` for secure path operations
4. **Input Validation**: Validate all user inputs, especially file paths

## Browser Automation Best Practices

1. **Wait Times**: Use configurable wait times for sheet rendering
2. **Headless Mode**: Default to headless operation for production
3. **Error Recovery**: Implement retry logic for browser operations
4. **Resource Cleanup**: Always close browser instances and pages

## API Integration Patterns

### QRS API (QSEoW)
```javascript
const qrsConfig = setupQseowQrsConnection(options);
const qrsInstance = new qrsInteract(qrsConfig);
const result = await qrsInstance.Get('endpoint');
```

### QS Cloud API
```javascript
const response = await axios.get(url, {
    headers: {
        'Authorization': `Bearer ${options.apikey}`,
        'Content-Type': 'application/json'
    }
});
```

## Debugging Tips

1. Use `--loglevel debug` or `--loglevel silly` for detailed troubleshooting
2. Check certificate paths and permissions for QSEoW issues
3. Verify API key validity and permissions for QS Cloud
4. Use browser developer tools by setting `--headless false`
5. Check network connectivity and firewall settings for API calls

## Contributing Guidelines

1. Follow existing code patterns and style
2. Add comprehensive tests for new functionality
3. Update documentation for new features
4. Use meaningful commit messages
5. Ensure all tests pass before submitting PRs
6. Add appropriate error handling and logging