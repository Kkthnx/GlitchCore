/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { createDeck } = require('../src/utils/statusRotation');

describe('createDeck', () => {
    test('deals every item before repeating any', () => {
        const items = ['a', 'b', 'c', 'd', 'e'];
        const deck = createDeck(items);

        const dealt = items.map(() => deck.next());
        expect(new Set(dealt).size).toBe(items.length);
        expect([...dealt].sort()).toEqual([...items].sort());
    });

    test('keeps cycling through full passes', () => {
        const items = ['a', 'b', 'c'];
        const deck = createDeck(items);

        for (let pass = 0; pass < 10; pass++) {
            const dealt = items.map(() => deck.next());
            expect(new Set(dealt).size).toBe(items.length);
        }
    });

    test('never deals the same item twice in a row, including across reshuffles', () => {
        // The seam between two shuffles is the one place a naive deck repeats,
        // and a back-to-back repeat is the only one anybody notices.
        const items = ['a', 'b', 'c', 'd'];
        const deck = createDeck(items);

        let previous = deck.next();
        for (let i = 0; i < 400; i++) {
            const current = deck.next();
            expect(current).not.toBe(previous);
            previous = current;
        }
    });

    test('does not repeat back to back even with a degenerate shuffle', () => {
        // rng always returning 0 makes Fisher-Yates produce a predictable order,
        // which would line the seam up for a repeat without the swap.
        const items = ['a', 'b'];
        const deck = createDeck(items, () => 0);

        let previous = deck.next();
        for (let i = 0; i < 20; i++) {
            const current = deck.next();
            expect(current).not.toBe(previous);
            previous = current;
        }
    });

    test('handles a single item without spinning or crashing', () => {
        const deck = createDeck(['only']);
        expect(deck.next()).toBe('only');
        expect(deck.next()).toBe('only');
    });

    test('returns null for an empty pool', () => {
        const deck = createDeck([]);
        expect(deck.next()).toBeNull();
        expect(deck.size).toBe(0);
    });

    test('is unaffected by later changes to the caller array', () => {
        const items = ['a', 'b'];
        const deck = createDeck(items);
        items.push('c'); // must not leak into the deck
        expect(deck.size).toBe(2);
    });

    test('reports how much is left before a reshuffle', () => {
        const deck = createDeck(['a', 'b', 'c']);
        deck.next();
        expect(deck.remaining).toBe(2);
        deck.next();
        deck.next();
        expect(deck.remaining).toBe(0);
    });
});
