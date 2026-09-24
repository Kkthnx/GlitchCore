/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Shared randomness helpers. One correct shuffle, in one place.
//
// There were three shuffles in the codebase: the giveaway draw and the status
// deck each had their own (correct) Fisher-Yates, and /roles recolor used
// `sort(() => Math.random() - 0.5)`, which is not a shuffle. A comparator that
// answers differently each time it's asked about the same pair is inconsistent,
// so the sort is free to do anything, and in practice it leaves elements close
// to where they started. For the recolor that meant the palette wasn't actually
// being spread around.
//
// `rng` is injectable throughout so the callers stay unit-testable.

/**
 * Fisher-Yates, in place. Every permutation equally likely, given a uniform rng.
 * @template T
 * @param {T[]} arr mutated and returned
 * @param {() => number} [rng]
 * @returns {T[]}
 */
function shuffle(arr, rng = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * A copy of `arr` in random order, leaving the original alone.
 * @template T
 * @param {readonly T[]} arr
 * @param {() => number} [rng]
 * @returns {T[]}
 */
function shuffled(arr, rng = Math.random) {
    return shuffle([...arr], rng);
}

/**
 * One random element, or undefined for an empty list.
 * @template T
 * @param {readonly T[]} arr
 * @param {() => number} [rng]
 * @returns {T|undefined}
 */
function pick(arr, rng = Math.random) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(rng() * arr.length)];
}

module.exports = { shuffle, shuffled, pick };
