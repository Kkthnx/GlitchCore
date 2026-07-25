/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { getLocalDateString, getLocalDay, getLocalDayName, msUntilNextLocalMidnight } = require('../src/utils/time');

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
