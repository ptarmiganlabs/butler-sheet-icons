import { describe, test, expect, jest } from '@jest/globals';
import { determineSheetBlurStatus } from '../determine-sheet-blur-status.js';
import { BLUR_REASON } from '../../util/sheet-decision-reasons.js';

// QSEoW twin: src/lib/qseow/__tests__/determine_sheet_blur_status.test.js.
// The platforms differ where the code does: no tag rule here, and the
// approved/published flags are read through undefined-safe normalisation.

const log = { verbose: jest.fn() };

const createSheet = ({ approved, published, title = 'Sheet', qId = 's1' } = {}) => ({
    qMeta: { approved, published, title, description: '' },
    qInfo: { qId },
});

const run = ({ sheet = createSheet(), options = {}, n = 1 } = {}) =>
    determineSheetBlurStatus(sheet, options, n, log);

describe('determineSheetBlurStatus (Cloud)', () => {
    test('no blur options: no blur, no reason', () => {
        expect(run()).toEqual({ blurSheet: false, blurReason: null });
    });

    test('public sheet blurred when "public" is listed', () => {
        expect(
            run({
                sheet: createSheet({ approved: true, published: true }),
                options: { blurSheetStatus: ['public'] },
            })
        ).toEqual({ blurSheet: true, blurReason: BLUR_REASON.STATUS_PUBLIC });
    });

    test('published sheet blurred when "published" is listed', () => {
        expect(
            run({
                sheet: createSheet({ approved: false, published: true }),
                options: { blurSheetStatus: ['published'] },
            })
        ).toEqual({ blurSheet: true, blurReason: BLUR_REASON.STATUS_PUBLISHED });
    });

    test('undefined approved/published flags read as false rather than throwing', () => {
        // The Cloud engine omits both flags on some sheets; a sheet with
        // neither is not "published", so the published rule must not fire.
        expect(
            run({
                sheet: createSheet({}),
                options: { blurSheetStatus: ['published', 'public'] },
            })
        ).toEqual({ blurSheet: false, blurReason: null });
    });

    test('sheet number rule matches on the 1-based position as a string', () => {
        expect(run({ options: { blurSheetNumber: ['2'] }, n: 2 })).toEqual({
            blurSheet: true,
            blurReason: BLUR_REASON.NUMBER,
        });
    });

    test('title rule matches exactly', () => {
        expect(
            run({
                sheet: createSheet({ title: 'Board pack' }),
                options: { blurSheetTitle: ['Board pack'] },
            })
        ).toEqual({ blurSheet: true, blurReason: BLUR_REASON.TITLE });
    });

    test('the first matching rule names the reason', () => {
        expect(
            run({
                sheet: createSheet({ approved: true, published: true }),
                options: { blurSheetStatus: ['public'], blurSheetNumber: ['1'] },
                n: 1,
            })
        ).toEqual({ blurSheet: true, blurReason: BLUR_REASON.STATUS_PUBLIC });
    });
    test('does not throw for a sheet the engine returned without qMeta', () => {
        // The extraction regression the review caught: the log label used to be
        // built eagerly from sheet.qMeta.title, so a qMeta-less sheet threw even
        // with no blur options passed - in the planner AND the real write path.
        expect(run({ sheet: { qInfo: { qId: 'bare' } } })).toEqual({
            blurSheet: false,
            blurReason: null,
        });
    });
});
