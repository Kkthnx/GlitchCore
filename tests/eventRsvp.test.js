/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { applyRsvp, parseStartTime } = require('../src/utils/eventRsvp');
const { zonedWallTimeToDate } = require('../src/utils/time');

const A = { userId: 'a', username: 'A' };
const B = { userId: 'b', username: 'B' };
const C = { userId: 'c', username: 'C' };
const empty = () => ({ going: [], maybe: [], waitlist: [] });

describe('applyRsvp', () => {
    test('adds to going and marks status', () => {
        const r = applyRsvp(empty(), A, 'going', 0);
        expect(r.going.map(m => m.userId)).toEqual(['a']);
        expect(r.status).toBe('going');
    });

    test('moving choice removes from previous list (no duplicates)', () => {
        const r = applyRsvp({ going: [A], maybe: [], waitlist: [] }, A, 'maybe', 0);
        expect(r.going).toHaveLength(0);
        expect(r.maybe.map(m => m.userId)).toEqual(['a']);
    });

    test('decline removes the user entirely', () => {
        const r = applyRsvp({ going: [A, B], maybe: [], waitlist: [] }, A, 'decline', 0);
        expect(r.going.map(m => m.userId)).toEqual(['b']);
        expect(r.status).toBe('removed');
    });

    test('respects capacity and waitlists the overflow', () => {
        const r = applyRsvp({ going: [A, B], maybe: [], waitlist: [] }, C, 'going', 2);
        expect(r.going.map(m => m.userId)).toEqual(['a', 'b']);
        expect(r.waitlist.map(m => m.userId)).toEqual(['c']);
        expect(r.status).toBe('waitlisted');
    });

    test('promotes from waitlist when a going slot frees up', () => {
        const r = applyRsvp({ going: [A, B], maybe: [], waitlist: [C] }, A, 'decline', 2);
        expect(r.going.map(m => m.userId)).toEqual(['b', 'c']);
        expect(r.waitlist).toHaveLength(0);
        expect(r.promoted).toEqual(['c']);
    });

    test('unlimited capacity never waitlists', () => {
        let lists = empty();
        for (const m of [A, B, C]) lists = applyRsvp(lists, m, 'going', 0);
        expect(lists.going).toHaveLength(3);
        expect(lists.waitlist).toHaveLength(0);
    });
});

describe('parseStartTime', () => {
    const now = Date.UTC(2026, 6, 23, 12, 0, 0);

    test('relative durations are offset from now', () => {
        expect(parseStartTime('2h', now).getTime()).toBe(now + 2 * 3600 * 1000);
        expect(parseStartTime('1d', now).getTime()).toBe(now + 24 * 3600 * 1000);
    });

    test('invalid input returns null', () => {
        expect(parseStartTime('whenever', now)).toBeNull();
        expect(parseStartTime('', now)).toBeNull();
    });
});

describe('zonedWallTimeToDate (America/New_York)', () => {
    test('summer wall time uses EDT (UTC-4)', () => {
        // 2026-07-25 20:00 ET == 2026-07-26 00:00 UTC
        expect(zonedWallTimeToDate('2026-07-25 20:00').toISOString()).toBe('2026-07-26T00:00:00.000Z');
    });

    test('winter wall time uses EST (UTC-5)', () => {
        // 2026-01-15 20:00 ET == 2026-01-16 01:00 UTC
        expect(zonedWallTimeToDate('2026-01-15 20:00').toISOString()).toBe('2026-01-16T01:00:00.000Z');
    });

    test('malformed strings return null', () => {
        expect(zonedWallTimeToDate('2026/07/25 20:00')).toBeNull();
        expect(zonedWallTimeToDate('not a date')).toBeNull();
    });
});
