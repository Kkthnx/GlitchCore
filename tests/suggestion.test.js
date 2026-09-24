/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { voteUpdate } = require('../src/utils/suggestionManager');

// Applies a Mongo-style $addToSet/$pull update to plain arrays, so these tests
// assert the vote's end state rather than the shape of the update document.
function applyOps(state, update) {
    const next = { upvotes: [...state.upvotes], downvotes: [...state.downvotes] };
    for (const [field, userId] of Object.entries(update.$pull || {})) {
        next[field] = next[field].filter(id => id !== userId);
    }
    for (const [field, userId] of Object.entries(update.$addToSet || {})) {
        if (!next[field].includes(userId)) next[field].push(userId);
    }
    return next;
}

// Mirrors how handleSuggestionButton decides the alreadyVoted flag.
function vote(state, userId, dir) {
    const list = dir === 'up' ? state.upvotes : state.downvotes;
    return applyOps(state, voteUpdate(userId, dir, list.includes(userId)));
}

const empty = { upvotes: [], downvotes: [] };

describe('voteUpdate', () => {
    test('adds an upvote', () => {
        expect(vote(empty, 'u', 'up')).toEqual({ upvotes: ['u'], downvotes: [] });
    });

    test('adds a downvote', () => {
        expect(vote(empty, 'u', 'down')).toEqual({ upvotes: [], downvotes: ['u'] });
    });

    test('clicking your current vote removes it (toggle off)', () => {
        expect(vote({ upvotes: ['u'], downvotes: [] }, 'u', 'up')).toEqual(empty);
        expect(vote({ upvotes: [], downvotes: ['u'] }, 'u', 'down')).toEqual(empty);
    });

    test('switching sides moves the vote rather than counting twice', () => {
        expect(vote({ upvotes: ['u'], downvotes: [] }, 'u', 'down')).toEqual({ upvotes: [], downvotes: ['u'] });
        expect(vote({ upvotes: [], downvotes: ['u'] }, 'u', 'up')).toEqual({ upvotes: ['u'], downvotes: [] });
    });

    test('does not disturb other voters', () => {
        expect(vote({ upvotes: ['a'], downvotes: ['b'] }, 'u', 'up'))
            .toEqual({ upvotes: ['a', 'u'], downvotes: ['b'] });
    });

    test('never lets one member sit on both sides', () => {
        const state = vote(vote(empty, 'u', 'up'), 'u', 'down');
        expect(state.upvotes).not.toContain('u');
        expect(state.downvotes).toContain('u');
    });

    test('two members voting from the same snapshot both count', () => {
        // The lost-update bug this replaces: both updates were built from the
        // same pre-read state, and whole-array writes meant the second erased
        // the first. Targeted ops compose instead.
        const snapshot = empty;
        let state = applyOps(snapshot, voteUpdate('a', 'up', false));
        state = applyOps(state, voteUpdate('b', 'up', false));
        expect(state.upvotes).toEqual(['a', 'b']);
    });

    test('is idempotent when the same add is applied twice', () => {
        const once = vote(empty, 'u', 'up');
        const twice = applyOps(once, voteUpdate('u', 'up', false));
        expect(twice.upvotes).toEqual(['u']);
    });
});
