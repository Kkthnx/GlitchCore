/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { shuffle, shuffled, pick } = require('../src/utils/random');

describe('shuffle', () => {
    test('keeps every element', () => {
        expect([...shuffle([1, 2, 3, 4, 5])].sort()).toEqual([1, 2, 3, 4, 5]);
    });

    test('mutates in place and returns the same array', () => {
        const arr = [1, 2, 3];
        expect(shuffle(arr)).toBe(arr);
    });

    test('actually reorders, given enough elements', () => {
        const original = Array.from({ length: 50 }, (_, i) => i);
        expect(shuffle([...original])).not.toEqual(original);
    });

    test('handles empty and single-element arrays', () => {
        expect(shuffle([])).toEqual([]);
        expect(shuffle(['x'])).toEqual(['x']);
    });

    test('produces a uniform distribution, unlike a random comparator', () => {
        // The bug this replaces was `sort(() => Math.random() - 0.5)`. An
        // inconsistent comparator leaves elements near where they started, so
        // the first element stays first far more often than 1-in-n. Here every
        // position should be roughly equally likely.
        const n = 5;
        const runs = 12000;
        const firstPlaceCounts = new Array(n).fill(0);

        for (let r = 0; r < runs; r++) {
            const out = shuffle([0, 1, 2, 3, 4]);
            firstPlaceCounts[out[0]] += 1;
        }

        const expected = runs / n;
        for (const count of firstPlaceCounts) {
            // Generous band: this is about catching a systematic bias, not noise.
            expect(count).toBeGreaterThan(expected * 0.75);
            expect(count).toBeLessThan(expected * 1.25);
        }
    });

    test('is deterministic with an injected rng', () => {
        const seq = [0.9, 0.1, 0.5, 0.2];
        let i = 0;
        const rng = () => seq[i++ % seq.length];

        const a = shuffle([1, 2, 3, 4, 5], rng);
        i = 0;
        const b = shuffle([1, 2, 3, 4, 5], rng);
        expect(a).toEqual(b);
    });
});

describe('shuffled', () => {
    test('leaves the original array untouched', () => {
        const original = [1, 2, 3, 4, 5, 6, 7, 8];
        const snapshot = [...original];
        shuffled(original);
        expect(original).toEqual(snapshot);
    });

    test('returns a permutation of the input', () => {
        const out = shuffled(['a', 'b', 'c']);
        expect([...out].sort()).toEqual(['a', 'b', 'c']);
    });
});

describe('pick', () => {
    test('returns an element of the list', () => {
        const list = ['a', 'b', 'c'];
        for (let i = 0; i < 50; i++) expect(list).toContain(pick(list));
    });

    test('can reach every element', () => {
        const list = ['a', 'b', 'c'];
        const seen = new Set();
        for (let i = 0; i < 500; i++) seen.add(pick(list));
        expect(seen.size).toBe(3);
    });

    test('is undefined for an empty or missing list', () => {
        expect(pick([])).toBeUndefined();
        expect(pick(undefined)).toBeUndefined();
        expect(pick(null)).toBeUndefined();
    });

    test('honours an injected rng', () => {
        expect(pick(['a', 'b', 'c'], () => 0)).toBe('a');
        expect(pick(['a', 'b', 'c'], () => 0.99)).toBe('c');
    });
});
