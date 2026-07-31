/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const {
    getLocalDateString, getLocalDay, getLocalDayName, msUntilNextLocalMidnight,
    zonedWallTimeString, zonedWallTimeToDate, addWeeksKeepingLocalTime,
} = require('../src/utils/time');

describe('community-timezone helpers (America/New_York)', () => {
    // 2026-07-24 03:30 UTC == 2026-07-23 23:30 America/New_York (still Thursday).
    // This is exactly the boundary that used to make the bot post a day early:
    // UTC has already rolled to Friday while the community is still on Thursday.
    const lateThursdayNight = new Date('2026-07-24T03:30:00Z');

    test('date string reflects the community day, not UTC', () => {
        expect(getLocalDateString(lateThursdayNight)).toBe('2026-07-23');
    });

    test('day-of-week reflects the community day, not UTC', () => {
        expect(getLocalDay(lateThursdayNight)).toBe(4); // Thursday
        expect(getLocalDayName(lateThursdayNight)).toBe('Thursday');
    });

    test('getLocalDay matches JS getDay() numbering (0=Sun..6=Sat)', () => {
        // 2026-07-26 is a Sunday.
        expect(getLocalDay(new Date('2026-07-26T16:00:00Z'))).toBe(0);
    });

    test('msUntilNextLocalMidnight is within one day and positive', () => {
        const ms = msUntilNextLocalMidnight(lateThursdayNight);
        expect(ms).toBeGreaterThan(0);
        expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });
});

describe('recurring-event time math', () => {
    // 2026-07-31 23:00 UTC == 2026-07-31 19:00 (7pm) America/New_York.
    const fridaySevenPm = new Date('2026-07-31T23:00:00Z');

    test('zonedWallTimeString renders the local wall clock', () => {
        expect(zonedWallTimeString(fridaySevenPm)).toBe('2026-07-31 19:00');
    });

    test('zonedWallTimeToDate round-trips with zonedWallTimeString', () => {
        const back = zonedWallTimeToDate(zonedWallTimeString(fridaySevenPm));
        expect(back.getTime()).toBe(fridaySevenPm.getTime());
    });

    test('addWeeksKeepingLocalTime keeps 7pm local a week later', () => {
        const next = addWeeksKeepingLocalTime(fridaySevenPm, 1);
        expect(zonedWallTimeString(next)).toBe('2026-08-07 19:00');
    });

    test('advancing across the fall DST change still lands at 7pm local', () => {
        // US DST ends 2026-11-01. A weekly 7pm event the week before/after
        // must stay 7pm wall-clock, not drift by the hour.
        const octLate = new Date('2026-10-30T23:00:00Z'); // 7pm ET, DST on
        const next = addWeeksKeepingLocalTime(octLate, 1); // crosses into standard time
        expect(zonedWallTimeString(next).endsWith('19:00')).toBe(true);
    });
});
