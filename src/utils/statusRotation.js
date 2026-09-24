/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Deals statuses like a deck of cards rather than rolling dice.
//
// Picking at random independently each time feels far more repetitive than
// people expect: with the rotation running every 10 minutes, a plain random
// pick from 200 statuses still shows a repeat within the same day about as
// often as not, and back-to-back duplicates happen outright. Dealing from a
// shuffled deck means every status is shown once before any is shown twice.

// Fisher-Yates, in place.
function shuffle(arr, rng = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * A deck over `items`. next() deals one, reshuffling once the deck runs out.
 *
 * @param {string[]} items
 * @param {() => number} [rng] injectable for tests
 */
function createDeck(items, rng = Math.random) {
    const source = [...items];
    let remaining = [];
    let last = null;

    return {
        next() {
            if (source.length === 0) return null;

            if (remaining.length === 0) {
                remaining = shuffle([...source], rng);

                // A fresh shuffle can start with the card we just dealt, which
                // would show the same status twice in a row at the seam, the one
                // repeat people actually notice. Bury it deeper in the deck.
                if (source.length > 1 && remaining[remaining.length - 1] === last) {
                    const top = remaining.length - 1;
                    const other = Math.floor(rng() * top);
                    [remaining[top], remaining[other]] = [remaining[other], remaining[top]];
                }
            }

            last = remaining.pop();
            return last;
        },

        /** How many are left before the next reshuffle. Exposed for tests. */
        get remaining() {
            return remaining.length;
        },

        get size() {
            return source.length;
        },
    };
}

module.exports = { createDeck, shuffle };
