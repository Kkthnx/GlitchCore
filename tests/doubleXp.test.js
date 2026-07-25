/*
 * GlitchCore — Copyright (c) 2026 Kkthnx. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, use, distribution, or
 * modification of this file or any part of it, via any medium, is strictly
 * prohibited. See the LICENSE file for full terms.
 */

const { isDoubleXpStartDay } = require('../src/utils/isDoubleXp');

// Default config: doubleXpDays = [5, 6] (Friday, Saturday).
// 0 = Sunday ... 5 = Friday, 6 = Saturday.
describe('isDoubleXpStartDay (Fri+Sat window)', () => {
    test('announces on Friday — the start of the streak', () => {
        expect(isDoubleXpStartDay(5)).toBe(true);
    });

    test('does NOT announce again on Saturday', () => {
        expect(isDoubleXpStartDay(6)).toBe(false);
    });

    test('does not announce on non-double days', () => {
        for (const d of [0, 1, 2, 3, 4]) expect(isDoubleXpStartDay(d)).toBe(false);
    });
});
