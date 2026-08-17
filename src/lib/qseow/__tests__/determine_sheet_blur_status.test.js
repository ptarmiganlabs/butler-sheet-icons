import { describe, test, expect, jest } from '@jest/globals';
import { determineSheetBlurStatus } from '../determine-sheet-blur-status.js';
import { BLUR_REASON } from '../../util/sheet-decision-reasons.js';

// Cloud twin: src/lib/cloud/__tests__/determine_sheet_blur_status.test.js.
// First direct coverage of the blur rules on either platform (#909) - the
// rules previously lived inside the write step, unreachable by a unit test.

const log = { verbose: jest.fn() };

const createSheet = ({
    approved = false,
    published = false,
    title = 'Sheet',
    qId = 's1',
} = {}) => ({
    qMeta: { approved, published, title, description: '' },
    qInfo: { qId },
});

const run = ({ sheet = createSheet(), options = {}, tagMetadata = [], n = 1 } = {}) =>
    determineSheetBlurStatus(sheet, options, tagMetadata, n, log);

describe('determineSheetBlurStatus (QSEoW)', () => {
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

    test('tag match blurs, and names the tag rule', () => {
        expect(
            run({
                sheet: createSheet({ qId: 'engine-7' }),
                options: { blurSheetTag: 'confidential' },
                tagMetadata: [{ engineObjectId: 'engine-7' }],
            })
        ).toEqual({ blurSheet: true, blurReason: BLUR_REASON.TAG });
    });

    test('tag option set but no match: no blur', () => {
        expect(
            run({
                sheet: createSheet({ qId: 'engine-7' }),
                options: { blurSheetTag: 'confidential' },
                tagMetadata: [{ engineObjectId: 'other' }],
            })
        ).toEqual({ blurSheet: false, blurReason: null });
    });

    test('sheet number rule matches on the 1-based position as a string', () => {
        expect(run({ options: { blurSheetNumber: ['3'] }, n: 3 })).toEqual({
            blurSheet: true,
            blurReason: BLUR_REASON.NUMBER,
        });
        expect(run({ options: { blurSheetNumber: ['3'] }, n: 2 })).toEqual({
            blurSheet: false,
            blurReason: null,
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
        // Status matches first; the number rule would also match but is never
        // consulted once the flag is set.
        expect(
            run({
                sheet: createSheet({ approved: true, published: true }),
                options: { blurSheetStatus: ['public'], blurSheetNumber: ['1'] },
                n: 1,
            })
        ).toEqual({ blurSheet: true, blurReason: BLUR_REASON.STATUS_PUBLIC });
    });
    test('does not throw for a sheet the engine returned without qMeta', () => {
        expect(run({ sheet: { qInfo: { qId: 'bare' } } })).toEqual({
            blurSheet: false,
            blurReason: null,
        });
    });
});
