/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { applyVote } = require('../src/utils/suggestionManager');

describe('applyVote', () => {
    test('adds an upvote', () => {
        expect(applyVote([], [], 'u', 'up')).toEqual({ up: ['u'], down: [] });
    });

    test('clicking your current vote removes it (toggle off)', () => {
        expect(applyVote(['u'], [], 'u', 'up')).toEqual({ up: [], down: [] });
    });

    test('switching from up to down moves the vote', () => {
        expect(applyVote(['u'], [], 'u', 'down')).toEqual({ up: [], down: ['u'] });
    });

    test('switching from down to up moves the vote', () => {
        expect(applyVote([], ['u'], 'u', 'up')).toEqual({ up: ['u'], down: [] });
    });

    test('does not disturb other voters', () => {
        expect(applyVote(['a'], ['b'], 'u', 'up')).toEqual({ up: ['a', 'u'], down: ['b'] });
    });
});
