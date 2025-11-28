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
});
