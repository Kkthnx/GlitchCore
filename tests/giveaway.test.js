const { pickWinners } = require('../src/utils/giveawayManager');

describe('pickWinners', () => {
    const entries = ['a', 'b', 'c', 'd', 'e'];

    test('returns the requested number of winners', () => {
        expect(pickWinners(entries, 3)).toHaveLength(3);
    });

    test('never returns more winners than entries', () => {
        expect(pickWinners(['a', 'b'], 5)).toHaveLength(2);
    });

    test('winners are unique and drawn from the pool', () => {
        const winners = pickWinners(entries, 5);
        expect(new Set(winners).size).toBe(winners.length);
        for (const w of winners) expect(entries).toContain(w);
    });

    test('deduplicates entries before drawing', () => {
        expect(pickWinners(['a', 'a', 'a'], 3)).toEqual(['a']);
    });

    test('handles empty pool and non-positive counts', () => {
        expect(pickWinners([], 3)).toEqual([]);
        expect(pickWinners(entries, 0)).toEqual([]);
    });

    test('uses the injected rng deterministically', () => {
        // rng always 0 -> Fisher-Yates swaps each i with index 0.
        const winners = pickWinners(['a', 'b', 'c'], 2, () => 0);
        expect(winners).toHaveLength(2);
        expect(new Set(winners).size).toBe(2);
    });
});
