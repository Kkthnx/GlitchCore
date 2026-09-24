/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { recordJoin, sweepIdle, _clearAll } = require('../src/utils/joinFlood');

const opts = { maxJoins: 3, windowMs: 1000 };

beforeEach(() => _clearAll());

describe('recordJoin', () => {
    test('a normal trickle of joins is never a flood', () => {
        // Hours apart, as a real community looks.
        for (let i = 0; i < 20; i++) {
            expect(recordJoin('g', i * 3_600_000, opts).flooded).toBe(false);
        }
    });

    test('trips once the rate passes the threshold inside the window', () => {
        expect(recordJoin('g', 0, opts).flooded).toBe(false);
        expect(recordJoin('g', 100, opts).flooded).toBe(false);
        expect(recordJoin('g', 200, opts).flooded).toBe(false);
        // Fourth join inside 1s, with a max of 3.
        expect(recordJoin('g', 300, opts).flooded).toBe(true);
    });

    test('reports how many joins are in the window', () => {
        recordJoin('g', 0, opts);
        expect(recordJoin('g', 100, opts).recent).toBe(2);
    });

    test('recovers once the burst ages out of the window', () => {
        for (const t of [0, 100, 200, 300]) recordJoin('g', t, opts);
        // Well past the window: the old timestamps are pruned.
        expect(recordJoin('g', 5_000, opts).flooded).toBe(false);
    });

    test('tracks guilds independently', () => {
        for (const t of [0, 100, 200, 300]) recordJoin('raided', t, opts);
        expect(recordJoin('raided', 400, opts).flooded).toBe(true);
        // A quiet server is unaffected by its neighbour's raid.
        expect(recordJoin('quiet', 400, opts).flooded).toBe(false);
    });

    test('stays tripped while the burst continues', () => {
        for (const t of [0, 100, 200, 300]) recordJoin('g', t, opts);
        for (const t of [400, 500, 600]) {
            expect(recordJoin('g', t, opts).flooded).toBe(true);
        }
    });

    test('uses defaults a real community will not reach', () => {
        // 10 joins in 20s by default, so 5 joins in a second is still fine.
        for (let i = 0; i < 5; i++) {
            expect(recordJoin('g', i * 200).flooded).toBe(false);
        }
    });
});

describe('sweepIdle', () => {
    test('forgets guilds with no recent joins', () => {
        recordJoin('g', 0, opts);
        sweepIdle(10 * 60 * 1000 + 1);
        // Swept, so the next join starts a fresh window rather than resuming one.
        expect(recordJoin('g', 10 * 60 * 1000 + 2, opts).recent).toBe(1);
    });

    test('keeps a guild that is actively being joined', () => {
        recordJoin('g', 1000, opts);
        sweepIdle(1500);
        expect(recordJoin('g', 1600, opts).recent).toBe(2);
    });
});
