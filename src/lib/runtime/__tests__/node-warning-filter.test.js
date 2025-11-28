import { installWarningFilter, __testing } from '../node-warning-filter.js';

const { resetWarningFilterForTests } = __testing;

describe('node-warning-filter', () => {
    afterEach(() => {
        resetWarningFilterForTests();
    });

    test('suppresses configured warning codes', () => {
        const captured = [];
        installWarningFilter({
            enabled: true,
            logger: {
                warn: (message) => captured.push(message),
            },
        });

        process.emit('warning', {
            name: 'DeprecationWarning',
            code: 'DEP0169',
            message: 'legacy url.parse usage',
        });

        expect(captured).toHaveLength(0);
    });

    test('logs warnings that are not suppressed', () => {
        const captured = [];
        installWarningFilter({
            enabled: true,
            logger: {
                warn: (message) => captured.push(message),
            },
        });

        process.emit('warning', {
            name: 'Warning',
            code: 'BSI_TEST_WARN',
            message: 'something unexpected happened',
        });

        expect(captured).toHaveLength(1);
        expect(captured[0]).toContain('something unexpected happened');
    });

    test('does not install listener when enabled is false', () => {
        const captured = [];
        installWarningFilter({
            enabled: false,
            logger: {
                warn: (message) => captured.push(message),
            },
        });

        process.emit('warning', {
            name: 'Warning',
            message: 'test warning',
        });

        expect(captured).toHaveLength(0);
    });

    test('is idempotent when called multiple times', () => {
        const captured = [];
        const logger = {
            warn: (message) => captured.push(message),
        };

        installWarningFilter({ enabled: true, logger });
        installWarningFilter({ enabled: true, logger });

        process.emit('warning', {
            name: 'Warning',
            code: 'BSI_TEST_WARN',
            message: 'duplicate check',
        });

        expect(captured).toHaveLength(1);
    });

    test('logs stack trace when warning has stack property', () => {
        const captured = [];
        const fakeStack = 'CustomStack: at line';
        installWarningFilter({
            enabled: true,
            logger: {
                warn: (message) => captured.push(message),
            },
        });

        process.emit('warning', {
            name: 'Warning',
            code: 'BSI_TEST_WARN',
            message: 'stacked',
            stack: fakeStack,
        });

        expect(captured).toHaveLength(1);
        expect(captured[0]).toBe(fakeStack);
    });

    test('logs warnings that lack a code', () => {
        const captured = [];
        installWarningFilter({
            enabled: true,
            logger: {
                warn: (message) => captured.push(message),
            },
        });

        process.emit('warning', {
            name: 'Warning',
            message: 'message-only warning',
        });

        expect(captured).toHaveLength(1);
        expect(captured[0]).toContain('message-only warning');
    });
});
