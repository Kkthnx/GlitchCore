/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { consume, sweepIdle } = require('../src/utils/commandCooldowns');

// Each test gets its own store so nothing leaks between cases.
let store;
beforeEach(() => { store = new Map(); });

describe('consume', () => {
    test('allows a command with no cooldown declared, every time', () => {
        for (let i = 0; i < 5; i++) {
            expect(consume('purge', 'mod', undefined, 1000 + i, store).allowed).toBe(true);
        }
        // Moderation commands must stay unlimited, so nothing is even tracked.
        expect(store.size).toBe(0);
    });

    test('treats a zero cooldown as no cooldown', () => {
        expect(consume('help', 'u', 0, 1000, store).allowed).toBe(true);
        expect(consume('help', 'u', 0, 1001, store).allowed).toBe(true);
    });

    test('allows the first call and blocks one inside the window', () => {
        expect(consume('rank', 'u', 10, 0, store).allowed).toBe(true);

        const blocked = consume('rank', 'u', 10, 3_000, store);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterMs).toBe(7_000);
    });

    test('allows again once the window has passed', () => {
        consume('rank', 'u', 10, 0, store);
        expect(consume('rank', 'u', 10, 10_000, store).allowed).toBe(true);
    });

    test('a blocked call does not extend the window', () => {
        consume('rank', 'u', 10, 0, store);
        consume('rank', 'u', 10, 5_000, store);  // blocked
        // Still measured from the call that actually ran, not the rejected one.
        expect(consume('rank', 'u', 10, 10_000, store).allowed).toBe(true);
    });

    test('tracks members independently', () => {
        expect(consume('rank', 'a', 10, 0, store).allowed).toBe(true);
        expect(consume('rank', 'b', 10, 0, store).allowed).toBe(true);
    });

    test('tracks commands independently', () => {
        expect(consume('rank', 'u', 10, 0, store).allowed).toBe(true);
        expect(consume('stats', 'u', 10, 0, store).allowed).toBe(true);
    });
});

describe('sweepIdle', () => {
    test('drops entries older than the idle window', () => {
        consume('rank', 'u', 10, 0, store);
        expect(store.size).toBe(1);

        sweepIdle(60 * 60 * 1000 + 1, 60 * 60 * 1000, store);
        expect(store.size).toBe(0);
    });

    test('keeps entries still inside the window', () => {
        consume('rank', 'u', 10, 0, store);
        sweepIdle(1000, 60 * 60 * 1000, store);
        expect(store.size).toBe(1);
    });
});
