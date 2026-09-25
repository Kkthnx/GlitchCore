/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { LIMITS, clamp, fitLines, mentionBatches } = require('../src/utils/embedText');

describe('clamp', () => {
    test('leaves text that already fits', () => {
        expect(clamp('short', 20)).toBe('short');
        expect(clamp('exactly-ten', 11)).toBe('exactly-ten');
    });

    test('truncates with an ellipsis, never exceeding the limit', () => {
        const out = clamp('x'.repeat(100), 10);
        expect(out).toHaveLength(10);
        expect(out.endsWith('…')).toBe(true);
    });

    test('handles null and undefined', () => {
        expect(clamp(null, 10)).toBe('');
        expect(clamp(undefined, 10)).toBe('');
    });
});

describe('fitLines', () => {
    test('returns everything when it all fits', () => {
        expect(fitLines(['a', 'b', 'c'], 100)).toBe('a\nb\nc');
    });

    test('never exceeds the budget', () => {
        const lines = Array.from({ length: 500 }, (_, i) => `line number ${i} with some padding`);
        for (const budget of [50, 200, 1000, 4096]) {
            expect(fitLines(lines, budget).length).toBeLessThanOrEqual(budget);
        }
    });

    test('says how many it left out', () => {
        const out = fitLines(['aaaa', 'bbbb', 'cccc', 'dddd'], 12);
        expect(out).toContain('more');
        // The count covers every line not shown, including the one it stopped on.
        const shown = out.split('\n').filter(l => !l.includes('more')).length;
        expect(out).toContain(`${4 - shown} more`);
    });

    test('reserves room for the summary rather than overflowing to add it', () => {
        const lines = Array.from({ length: 20 }, () => 'x'.repeat(10));
        const out = fitLines(lines, 60);
        expect(out.length).toBeLessThanOrEqual(60);
        expect(out).toContain('more');
    });

    test('counts the separator, not just the entries', () => {
        // The bug this guards: budgeting for '\n' and then joining with ', '
        // adds a character per entry, so the result came out over the limit.
        const entries = Array.from({ length: 2000 }, (_, i) => `\`tag-${i}\``);
        for (const separator of ['\n', ', ', ' | ']) {
            const out = fitLines(entries, 4096, { separator });
            expect(out.length).toBeLessThanOrEqual(4096);
        }
    });

    test('still accepts a bare summary function, as the first callers passed', () => {
        const out = fitLines(['aaaa', 'bbbb', 'cccc'], 10, n => `(+${n})`);
        expect(out).toMatch(/\(\+\d\)/);
    });

    test('accepts a custom summary', () => {
        const out = fitLines(['aaaa', 'bbbb', 'cccc'], 10, n => `(+${n})`);
        expect(out).toMatch(/\(\+\d\)/);
    });

    test('is empty for no lines', () => {
        expect(fitLines([], 100)).toBe('');
    });

    test('handles a single line longer than the whole budget', () => {
        expect(() => fitLines(['x'.repeat(500)], 50)).not.toThrow();
        expect(fitLines(['x'.repeat(500)], 50).length).toBeLessThanOrEqual(50);
    });
});

describe('mentionBatches', () => {
    const mention = i => `<@${100000000000000000n + BigInt(i)}>`;

    test('keeps a small roster in one message', () => {
        const out = mentionBatches([mention(1), mention(2)], 'lead\n');
        expect(out).toHaveLength(1);
        expect(out[0].startsWith('lead')).toBe(true);
    });

    test('never exceeds the content limit', () => {
        for (const n of [50, 100, 250, 1000]) {
            const out = mentionBatches(Array.from({ length: n }, (_, i) => mention(i)), 'lead\n');
            for (const content of out) expect(content.length).toBeLessThanOrEqual(LIMITS.content);
        }
    });

    test('stays under the 100-entry allowed_mentions cap per message', () => {
        const out = mentionBatches(Array.from({ length: 500 }, (_, i) => mention(i)), 'lead\n');
        for (const content of out) {
            expect((content.match(/<@\d+>/g) || []).length).toBeLessThanOrEqual(100);
        }
    });

    test('mentions everybody exactly once across the batches', () => {
        const ids = Array.from({ length: 250 }, (_, i) => mention(i));
        const joined = mentionBatches(ids, 'lead\n').join(' ');
        for (const id of ids) expect(joined).toContain(id);
        expect((joined.match(/<@\d+>/g) || []).length).toBe(ids.length);
    });

    test('puts the lead on the first message only', () => {
        const out = mentionBatches(Array.from({ length: 300 }, (_, i) => mention(i)), 'GAME TIME\n');
        expect(out.length).toBeGreaterThan(1);
        expect(out[0].startsWith('GAME TIME')).toBe(true);
        for (const later of out.slice(1)) expect(later.startsWith('GAME TIME')).toBe(false);
    });

    test('still sends the lead when there is nobody to mention', () => {
        expect(mentionBatches([], 'nobody came')).toEqual(['nobody came']);
        expect(mentionBatches([], '')).toEqual([]);
    });
});
