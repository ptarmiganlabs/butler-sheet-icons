import { describe, test, expect } from '@jest/globals';
import dotenv from 'dotenv';
import { mergeEnvContents, locateAssignments } from '../merge-env-file.js';

const DQ = String.fromCharCode(34);

const apply = (current, entries) => mergeEnvContents(current, entries);
const parse = (text) => dotenv.parse(Buffer.from(text));

describe('what the merge must not touch', () => {
    test('carries comments and unrelated settings across unchanged', () => {
        // The whole reason for merging rather than replacing: a .env holds the
        // settings for every command run from that directory, plus whatever the
        // operator put there themselves.
        const current = ['# my notes', 'UNRELATED=keep me', 'OWNED=old'].join('\n') + '\n';
        const { contents } = apply(current, [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(contents).toContain('# my notes');
        expect(contents).toContain('UNRELATED=keep me');
        expect(parse(contents).UNRELATED).toBe('keep me');
    });

    test('leaves another command’s value byte-identical, quoting and all', () => {
        const current = `OTHER=${DQ}kept  verbatim${DQ}\nOWNED=old\n`;
        const { contents } = apply(current, [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(contents).toContain(`OTHER=${DQ}kept  verbatim${DQ}`);
    });

    test('preserves an export prefix on a line it rewrites', () => {
        // Presumably there because something else sources the file.
        const { contents } = apply('export OWNED=old\n', [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(contents).toContain("export OWNED='new'");
        expect(parse(contents).OWNED).toBe('new');
    });
});

describe('the cases that would silently corrupt a file', () => {
    test('replaces a multiline value as one unit, leaving no orphan', () => {
        // Replacing only the opening line would leave the tail behind as a
        // fragment, which parses as garbage or breaks the rest of the file.
        const current = [`OWNED=${DQ}line one`, `line two${DQ}`, 'AFTER=intact'].join('\n') + '\n';
        const { contents } = apply(current, [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(contents).not.toContain('line two');
        expect(parse(contents)).toEqual({ OWNED: 'new', AFTER: 'intact' });
    });

    test('rewrites the last duplicate, which is the one dotenv actually uses', () => {
        // Verified against dotenv: the last occurrence wins. Rewriting the first
        // would look correct in a diff and change nothing about the run.
        const current = 'OWNED=first\nOTHER=x\nOWNED=second\n';
        const { contents } = apply(current, [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(parse(contents).OWNED).toBe('new');
    });
});

describe('adding what is not there', () => {
    test('appends a setting the file does not have', () => {
        const { contents, added } = apply('EXISTING=x\n', [{ name: 'NEW', line: "NEW='y'" }]);

        expect(added).toEqual(['NEW']);
        expect(parse(contents)).toEqual({ EXISTING: 'x', NEW: 'y' });
    });

    test('reports updates and additions separately, so the caller can say which', () => {
        const { updated, added } = apply('A=old\n', [
            { name: 'A', line: "A='new'" },
            { name: 'B', line: "B='fresh'" },
        ]);

        expect(updated).toEqual(['A']);
        expect(added).toEqual(['B']);
    });

    test('does not accumulate blank lines when the same key is saved repeatedly', () => {
        let contents = 'EXISTING=x\n';

        for (let i = 0; i < 3; i += 1) {
            contents = apply(contents, [{ name: 'NEW', line: "NEW='y'" }]).contents;
        }

        expect(contents.match(/\n\n\n/)).toBeNull();
        expect(parse(contents)).toEqual({ EXISTING: 'x', NEW: 'y' });
    });

    test('writes the header once when different keys are added over several saves', () => {
        // The realistic pattern - one command's settings, then another's - and
        // the one the test above misses: saving the *same* key twice is an
        // update the second time, so it never reaches the appending branch.
        let contents = 'EXISTING=x\n';

        contents = apply(contents, [{ name: 'A', line: "A='1'" }]).contents;
        contents = apply(contents, [{ name: 'B', line: "B='2'" }]).contents;

        expect(contents.match(/Added by/g)).toHaveLength(1);
        expect(parse(contents)).toEqual({ EXISTING: 'x', A: '1', B: '2' });
    });

    test('handles an empty file', () => {
        const { contents } = apply('', [{ name: 'A', line: "A='1'" }]);

        expect(parse(contents)).toEqual({ A: '1' });
    });
});

describe('malformed and Windows files', () => {
    test('an unterminated quote does not swallow the rest of the file', () => {
        // The range for a quoted value runs to its closing quote. When there is
        // no closing quote, reading it that way puts every remaining line inside
        // the key's range - and replacing the key then deletes all of them. A
        // stray quote in a hand-edited .env is entirely ordinary.
        const current =
            [`OWNED=${DQ}never closed`, 'OTHER=keep me', '# my notes', 'THIRD=also keep'].join(
                '\n'
            ) + '\n';

        const { contents } = apply(current, [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(contents).toContain('OTHER=keep me');
        expect(contents).toContain('# my notes');
        expect(contents).toContain('THIRD=also keep');
    });

    test('a CRLF file is updated in place, not appended to', () => {
        // `.` does not match \r in JavaScript, so matching the raw line found
        // nothing at all: every setting was treated as absent and appended, and
        // the file grew a duplicate on every save. Qlik Sense Enterprise runs on
        // Windows, so a .env touched by Notepad is the likely case there.
        const current = ['OWNED=old', 'OTHER=keep me'].join('\r\n') + '\r\n';

        const { contents, updated, added } = apply(current, [
            { name: 'OWNED', line: "OWNED='new'" },
        ]);

        expect(updated).toEqual(['OWNED']);
        expect(added).toEqual([]);
        expect(contents).not.toContain('OWNED=old');
        expect(parse(contents).OWNED).toBe('new');
    });

    test('a CRLF file keeps CRLF endings', () => {
        const current = 'OWNED=old\r\nOTHER=keep me\r\n';

        const { contents } = apply(current, [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(contents).toContain("OWNED='new'\r\n");
        expect(contents).toContain('OTHER=keep me\r\n');
    });

    test('an LF file is not given CRLF endings', () => {
        const { contents } = apply('OWNED=old\n', [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(contents).not.toContain('\r');
    });

    test('a CRLF file gains new settings with CRLF endings too', () => {
        const { contents } = apply('EXISTING=x\r\n', [{ name: 'NEW', line: "NEW='y'" }]);

        expect(contents).toContain("NEW='y'\r\n");
        expect(parse(contents)).toEqual({ EXISTING: 'x', NEW: 'y' });
    });
});

describe('locateAssignments', () => {
    test('ignores keys it was not asked about', () => {
        const found = locateAssignments(['A=1', 'B=2'], new Set(['A']));

        expect([...found.keys()]).toEqual(['A']);
    });

    test('reports the full range of a multiline value', () => {
        const found = locateAssignments([`A=${DQ}one`, 'two', `three${DQ}`], new Set(['A']));

        expect(found.get('A')).toMatchObject({ start: 0, end: 2 });
    });
});
