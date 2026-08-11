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
    test('leaves a multiline value alone and appends the new one instead', () => {
        // Rewriting a value that spans lines means guessing where it ends, and
        // every destructive bug this file has had came from guessing wrong and
        // deleting what it guessed over. The old block is left untouched; the
        // new value is appended, and dotenv's last-one-wins rule makes it the
        // effective one. Nothing is deleted to achieve that.
        const current = [`OWNED=${DQ}line one`, `line two${DQ}`, 'AFTER=intact'].join('\n') + '\n';

        const { contents, superseded } = apply(current, [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(superseded).toEqual(['OWNED']);
        expect(contents).toContain('line two');
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

    test('adds under the header when the file already has one', () => {
        // Writing the header once but appending at the end leaves later settings
        // orphaned beneath whatever happened to be last, with nothing saying
        // where they came from.
        const current =
            ['# Added by the Butler Sheet Icons wizard', "A='1'", 'ZZZ=unrelated'].join('\n') +
            '\n';

        const { contents } = apply(current, [{ name: 'B', line: "B='2'" }]);
        const lines = contents.trimEnd().split('\n');

        expect(lines).toEqual([
            '# Added by the Butler Sheet Icons wizard',
            "B='2'",
            "A='1'",
            'ZZZ=unrelated',
        ]);
        expect(contents.match(/Added by/g)).toHaveLength(1);
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

    test('a quote in an unrelated setting does not make it deletable', () => {
        // dotenv only ends a quoted value at a quote with nothing but whitespace
        // or a comment after it - `OTHER=say "hi` stays a separate setting. So a
        // scan that stops at any quote absorbs it into the previous value's
        // range and deletes it when that value is replaced.
        const current =
            [`OWNED=${DQ}line one`, `OTHER=say ${DQ}hi`, 'THIRD=keep me'].join('\n') + '\n';

        const { contents } = apply(current, [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(contents).toContain(`OTHER=say ${DQ}hi`);
        expect(contents).toContain('THIRD=keep me');
    });

    test('a line inside someone else\u2019s multiline value is never rewritten', () => {
        // The reason the scan still exists at all. dotenv reads this as a single
        // value of `line one\nOWNED=inside`, so the middle line is not an
        // assignment - rewriting it would corrupt the value it sits in.
        const current =
            [`OTHER=${DQ}line one`, 'OWNED=inside', `line three${DQ}`, 'AFTER=intact'].join('\n') +
            '\n';

        const { contents, updated } = apply(current, [{ name: 'OWNED', line: "OWNED='new'" }]);

        expect(updated).toEqual([]);
        expect(contents).toContain('OWNED=inside');
        expect(parse(contents).AFTER).toBe('intact');
    });

    test('a CRLF file with no trailing newline still gets CRLF additions', () => {
        // A line with no terminator carries no evidence of the convention, and
        // counting it as LF made this file come out mixed.
        const { contents } = apply('OWNED=old\r\nOTHER=x', [{ name: 'NEW', line: "NEW='y'" }]);

        expect(contents).toContain("NEW='y'\r\n");
        expect(contents).not.toMatch(/[^\r]\n/);
    });

    test('a CRLF file gains new settings with CRLF endings too', () => {
        const { contents } = apply('EXISTING=x\r\n', [{ name: 'NEW', line: "NEW='y'" }]);

        expect(contents).toContain("NEW='y'\r\n");
        expect(parse(contents)).toEqual({ EXISTING: 'x', NEW: 'y' });
    });
});

describe('locateAssignments', () => {
    test('ignores keys it was not asked about', () => {
        const { found } = locateAssignments(['A=1', 'B=2'], new Set(['A']));

        expect([...found.keys()]).toEqual(['A']);
    });

    test('reports a key whose value spans lines rather than locating it', () => {
        // Not locatable means not rewritten, which is the whole point: the
        // caller appends instead.
        const { found, spanning } = locateAssignments(
            [`A=${DQ}one`, 'two', `three${DQ}`],
            new Set(['A'])
        );

        expect(found.has('A')).toBe(false);
        expect([...spanning]).toEqual(['A']);
    });
});
