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

    test('does not accumulate blank lines when saved repeatedly', () => {
        let contents = 'EXISTING=x\n';

        for (let i = 0; i < 3; i += 1) {
            contents = apply(contents, [{ name: 'NEW', line: "NEW='y'" }]).contents;
        }

        expect(contents.match(/\n\n\n/)).toBeNull();
        expect(parse(contents)).toEqual({ EXISTING: 'x', NEW: 'y' });
    });

    test('handles an empty file', () => {
        const { contents } = apply('', [{ name: 'A', line: "A='1'" }]);

        expect(parse(contents)).toEqual({ A: '1' });
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
