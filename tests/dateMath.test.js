/*
 * GlitchCore. Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

// Regression cover for two date bugs that were fixed by hand: the birthday
// countdown wrapping on a 365-day basis while its day-of-year spans 366, and
// the daily streak deriving "yesterday" by subtracting a fixed 24h.
const { previousLocalDate } = require('../src/utils/time');
const { daysUntil } = require('../src/commands/birthday');

describe('previousLocalDate', () => {
    test('steps back one day', () => {
        expect(previousLocalDate('2026-09-12')).toBe('2026-09-11');
    });

    test('crosses a month boundary', () => {
        expect(previousLocalDate('2026-09-01')).toBe('2026-08-31');
    });

    test('crosses a year boundary', () => {
        expect(previousLocalDate('2026-01-01')).toBe('2025-12-31');
    });

    test('handles a leap day', () => {
        expect(previousLocalDate('2028-03-01')).toBe('2028-02-29');
    });

    test('is unaffected by the US spring-forward date', () => {
        // A fixed 24h subtraction here could land back on the same local day.
        expect(previousLocalDate('2026-03-09')).toBe('2026-03-08');
    });
});

describe('daysUntil', () => {
    test('returns 0 on the birthday itself', () => {
        expect(daysUntil(9, 12, { month: 9, day: 12 })).toBe(0);
    });

    test('counts forward within the same month', () => {
        expect(daysUntil(9, 20, { month: 9, day: 12 })).toBe(8);
    });

    test('wraps across the year end on the same 366-day basis', () => {
        // Dec 1 to Jan 2 is 30 remaining December days plus 2.
        expect(daysUntil(1, 2, { month: 12, day: 1 })).toBe(32);
    });

    test('a birthday one day past today wraps to nearly a full year', () => {
        expect(daysUntil(1, 1, { month: 1, day: 2 })).toBe(365);
    });
});
