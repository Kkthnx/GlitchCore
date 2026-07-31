/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { chunkLines } = require('../src/commands/help');

describe('chunkLines', () => {
    test('keeps a small list in a single chunk', () => {
        const out = chunkLines(['a', 'b', 'c'], 1024);
        expect(out).toEqual(['a\nb\nc']);
    });

    test('splits so no chunk exceeds the limit', () => {
        const lines = Array.from({ length: 50 }, (_, i) => `line-${i}-${'x'.repeat(30)}`);
        const out = chunkLines(lines, 1024);
        expect(out.length).toBeGreaterThan(1);
        for (const chunk of out) expect(chunk.length).toBeLessThanOrEqual(1024);
    });

    test('reassembles to the original lines', () => {
        const lines = Array.from({ length: 40 }, (_, i) => `cmd-${i}`);
        const out = chunkLines(lines, 40);
        expect(out.join('\n').split('\n')).toEqual(lines);
    });

    test('truncates a single over-long line instead of dropping it', () => {
        const out = chunkLines(['y'.repeat(2000)], 1024);
        expect(out).toHaveLength(1);
        expect(out[0].length).toBeLessThanOrEqual(1024);
        expect(out[0].endsWith('…')).toBe(true);
    });

    test('returns an empty array for no lines', () => {
        expect(chunkLines([], 1024)).toEqual([]);
    });
});
